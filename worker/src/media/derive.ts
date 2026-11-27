// Cache provider artwork (posters, logos) into R2 as content-hashed derivatives and write the public
// URLs back into the record's frontmatter. Owner photos and cutouts join in Stage 4.
import type { Env } from '../env';
import { clipProvider } from './clip';
import { Tmdb, OpenLibrary, MusicBrainz } from '@lem/providers';
import { newId } from '@lem/vault-core';
import { one, run, now } from '../db';
import { vaultCommit } from '../do/VaultWriter';
import { hash8, readDims, putVariant, extFor, contentTypeFor } from './store';
import { enqueue } from '../processor/jobs';
import { findImage } from './find-image';

function providerUrl(ref: string, imageBase?: string): string | null {
  if (ref.startsWith('tmdb:')) return Tmdb.posterUrl(ref.slice(5), 'w780', imageBase);
  if (ref.startsWith('tmdb-logo:')) return Tmdb.posterUrl(ref.slice(10), 'w500', imageBase);
  if (ref.startsWith('openlibrary:')) return OpenLibrary.coverUrl(Number(ref.slice(12)), 'L');
  if (ref.startsWith('caa:')) return MusicBrainz.coverUrl(ref.slice(4), 1200);
  return null;
}

export interface DeriveJob { record_path: string; poster?: string; logo?: string; cover?: string; og?: string }

/** Some shops refuse Cloudflare's addresses. Leave the URL for the Mac (tools/mac/clip-sync.sh), which downloads it from home and uploads it. */
export async function handOffToMac(env: Env, recordId: string, recordPath: string, url: string, reason: string): Promise<void> {
  const open = await one<{ id: string }>(env.DB, "SELECT id FROM fetch_queue WHERE record_id = ? AND url = ? AND status = 'pending'", recordId, url);
  if (open) return;
  await run(env.DB, "INSERT INTO fetch_queue (id, record_id, record_path, url, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)", newId('fetch'), recordId, recordPath, url, reason.slice(0, 300), now(), now());
}

const cutoutKinds = (kind: string | null | undefined) => !['book', 'album', 'film', 'tv'].includes(kind ?? '');

/** Store bytes the Mac (or an upload) fetched as the record's artwork: original + full + thumb, patch the record, queue the follow-up clip. */
export async function storeArtworkBytes(env: Env, recordId: string, buf: ArrayBuffer, contentType: string, source: string): Promise<{ media_id: string; full: string; thumb: string }> {
  const rec = await one<{ path: string; kind: string | null; frontmatter_json: string | null }>(env.DB, 'SELECT path, kind, frontmatter_json FROM records WHERE id = ?', recordId);
  if (!rec) throw new Error(`record ${recordId} not indexed`);
  let media = await one<{ id: string }>(env.DB, "SELECT id FROM media WHERE record_id = ? AND kind = 'artwork'", recordId);
  if (!media) {
    media = { id: newId('med') };
    await run(env.DB, "INSERT INTO media (id, kind, provider_ref, record_id, approved, created_at) VALUES (?, 'artwork', ?, ?, 1, ?)", media.id, source, recordId, now());
  }
  const ext = extFor(contentType, 'jpg');
  const dims = readDims(buf);
  const origKey = `orig/artwork/${media.id}/original.${ext}`;
  await env.MEDIA.put(origKey, buf, { httpMetadata: { contentType: contentTypeFor(ext) } });
  await run(env.DB, 'UPDATE media SET orig_key = ?, width = ?, height = ?, provider_ref = ? WHERE id = ?', origKey, dims?.[0] ?? null, dims?.[1] ?? null, source, media.id);
  const full = await putVariant(env, media.id, 'full', buf, ext, { width: 1600, format: 'webp', provider: 'mac' });
  const thumb = await putVariant(env, media.id, 'thumb', buf, ext, { width: 400, format: 'webp', provider: 'mac' });
  const art = (JSON.parse(rec.frontmatter_json ?? '{}') as { artwork?: { treatment?: string } }).artwork ?? {};
  const wantsCutout = cutoutKinds(rec.kind);
  const sets: Array<{ at: string[]; value: unknown }> = [
    { at: ['artwork', 'media'], value: media.id }, { at: ['artwork', 'source'], value: source },
    { at: ['artwork', 'full'], value: full.url }, { at: ['artwork', 'full_size'], value: [full.w, full.h] },
    { at: ['artwork', 'thumb'], value: thumb.url }, { at: ['artwork', 'thumb_size'], value: [thumb.w, thumb.h] },
  ];
  if (!art.treatment || art.treatment === 'typeset' || art.treatment === 'paper') sets.push({ at: ['artwork', 'treatment'], value: wantsCutout ? 'paper' : 'cover' });
  const path = `${rec.path}.md`;
  await vaultCommit(env, { message: `agent: artwork for ${rec.path.split('/').pop()}`, ops: [{ op: 'setIn', path, sets }], jobId: `media:${recordId}:${full.hash}` });
  // the follow-up: products and the like get cut out, covers get their white margins trimmed; both run on the Mac unless Replicate is set
  const mode = wantsCutout ? 'cutout' : 'trim';
  const provider = mode === 'trim' || !env.REPLICATE_TOKEN ? 'local' : 'replicate';
  await run(env.DB, "INSERT OR REPLACE INTO media_variants (media_id, variant, status, provider, params_json, updated_at) VALUES (?, 'clip', 'pending', ?, ?, ?)", media.id, provider, JSON.stringify(mode === 'trim' ? { mode: 'trim' } : {}), now());
  await enqueue(env, 'derive_clip', media.id, `clip:${media.id}:${full.hash}`, { record_path: path, media_id: media.id, provider, params: mode === 'trim' ? { mode: 'trim' } : {} });
  return { media_id: media.id, full: full.url, thumb: thumb.url };
}

/** Download provider artwork once, store full + thumb (+ logo) in R2, patch the record's artwork keys. */
export async function deriveProviderArtwork(env: Env, recordId: string, job: DeriveJob, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<{ media_id: string; sets: Array<{ at: string[]; value: unknown }> }> {
  let media = await one<{ id: string }>(env.DB, "SELECT id FROM media WHERE record_id = ? AND kind = 'artwork'", recordId);
  if (!media) {
    media = { id: newId('med') };
    await run(env.DB, "INSERT INTO media (id, kind, provider_ref, record_id, approved, created_at) VALUES (?, 'artwork', ?, ?, 1, ?)", media.id, job.poster ?? job.logo ?? null, recordId, now());
  }
  const sets: Array<{ at: string[]; value: unknown }> = [{ at: ['artwork', 'media'], value: media.id }];
  let foundSource: string | undefined;
  const recRow = await one<{ frontmatter_json: string | null }>(env.DB, 'SELECT frontmatter_json FROM records WHERE id = ?', recordId);
  const pageUrl = (JSON.parse(recRow?.frontmatter_json ?? '{}') as { url?: string }).url;
  const put = async (variant: 'full' | 'thumb' | 'clip', ref: string, width?: number) => {
    let buf: ArrayBuffer;
    let ext: string;
    if (ref.startsWith('find:')) {
      const found = await findImage(ref.slice(5), fetchImpl, env.PAGE_PROXY_URL || undefined);
      if (!found) throw new Error(`no image found for ${ref.slice(5)}`);
      buf = found.bytes;
      ext = found.contentType.includes('png') ? 'png' : found.contentType.includes('svg') ? 'svg' : found.contentType.includes('webp') ? 'webp' : found.contentType.includes('icon') ? 'ico' : 'jpg';
      foundSource = `found-${found.source}`;
    } else {
      const src = ref.startsWith('url:') ? ref.slice(4) : providerUrl(ref, env.TMDB_IMAGE_URL || undefined);
      if (!src) return;
      // shops' CDNs often refuse non-browser requests: look like a browser, say where we came from
      const res = await fetchImpl(src, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', ...(pageUrl ? { referer: pageUrl } : {}) }, redirect: 'follow' });
      if (!res.ok) throw new Error(`artwork ${res.status} ${src}`);
      buf = await res.arrayBuffer();
      ext = (res.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
    }
    let dims = readDims(buf);
    if (width && env.IMAGES && dims && dims[0] > width) {
      try {
        const out = await env.IMAGES.input(new Response(buf).body!).transform({ width }).output({ format: 'image/webp', quality: 82 });
        buf = await (await out.response()).arrayBuffer();
        ext = 'webp';
        dims = [width, Math.round((dims[1] / dims[0]) * width)];
      } catch {
        /* keep original bytes */
      }
    }
    const h = await hash8(buf);
    const key = `derived/${media!.id}/${variant}-${h}.${ext}`;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg' } });
    await run(env.DB, 'INSERT OR REPLACE INTO media_variants (media_id, variant, r2_key, hash8, width, height, status, provider, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', media!.id, variant, key, h, dims?.[0] ?? null, dims?.[1] ?? null, 'ready', ref.split(':')[0], now());
    sets.push({ at: ['artwork', variant], value: `/m/${media!.id}/${variant}-${h}.${ext}` });
    if (dims) sets.push({ at: ['artwork', `${variant}_size`], value: dims });
  };
  if (job.poster) {
    await put('full', job.poster, 1600);
    await put('thumb', job.poster, 400);
  }
  if (job.cover) {
    await put('full', job.cover, 1600);
    await put('thumb', job.cover, 400);
  }
  if (job.og) {
    try {
      await put('full', job.og, 1600);
      await put('thumb', job.og, 400);
    } catch (e) {
      // blocked or unreachable from here: the Mac fetches it from home instead
      const src = job.og.startsWith('url:') ? job.og.slice(4) : job.og.startsWith('find:') ? job.og.slice(5) : null;
      if (!src) throw e;
      await handOffToMac(env, recordId, job.record_path, src, (e as Error).message);
      return { media_id: media.id, sets: [], handed_off: true } as { media_id: string; sets: Array<{ at: string[]; value: unknown }> };
    }
    if (foundSource) { sets.push({ at: ['artwork', 'source'], value: foundSource }); if (foundSource !== 'found-og') sets.push({ at: ['artwork', 'treatment'], value: 'cover' }); }
    // a product shot or page picture gets cut out like an upload would (a found logo or icon stays a cover)
    const recMeta = await one<{ kind: string | null; type: string | null }>(env.DB, 'SELECT kind, type FROM records WHERE id = ?', recordId);
    const recKind = recMeta?.kind;
    const art = (JSON.parse(recRow?.frontmatter_json ?? '{}') as { artwork?: { treatment?: string } }).artwork ?? {};
    // pieces and posts get cut out like things do; set `treatment: paper` on the record to keep a picture whole
    if (!['book', 'album', 'film', 'tv'].includes(recKind ?? '') && (!foundSource || foundSource === 'found-og') && (!art.treatment || art.treatment === 'cutout')) {
      const provider = clipProvider(env);
      await run(env.DB, "INSERT OR REPLACE INTO media_variants (media_id, variant, status, provider, params_json, updated_at) VALUES (?, 'clip', 'pending', ?, '{}', ?)", media.id, provider, now());
      await enqueue(env, 'derive_clip', media.id, `clip:${media.id}:auto`, { record_path: job.record_path, media_id: media.id, provider, params: {} }, 5_000);
    }
  }
  if (job.logo) await put('clip', job.logo);
  await vaultCommit(env, { message: `agent: artwork for ${job.record_path.split('/').pop()?.replace(/\.md$/, '')}`, ops: [{ op: 'setIn', path: job.record_path, sets }], jobId: `media:${recordId}` });
  return { media_id: media.id, sets };
}
