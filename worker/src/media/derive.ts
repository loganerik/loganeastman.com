// Cache provider artwork (posters, logos) into R2 as content-hashed derivatives and write the public
// URLs back into the record's frontmatter. Owner photos and cutouts join in Stage 4.
import type { Env } from '../env';
import { Tmdb, OpenLibrary, MusicBrainz } from '@lem/providers';
import { newId } from '@lem/vault-core';
import { one, run, now } from '../db';
import { vaultCommit } from '../do/VaultWriter';
import { hash8, readDims } from './store';

function providerUrl(ref: string, imageBase?: string): string | null {
  if (ref.startsWith('tmdb:')) return Tmdb.posterUrl(ref.slice(5), 'w780', imageBase);
  if (ref.startsWith('tmdb-logo:')) return Tmdb.posterUrl(ref.slice(10), 'w500', imageBase);
  if (ref.startsWith('openlibrary:')) return OpenLibrary.coverUrl(Number(ref.slice(12)), 'L');
  if (ref.startsWith('caa:')) return MusicBrainz.coverUrl(ref.slice(4), 1200);
  return null;
}

export interface DeriveJob { record_path: string; poster?: string; logo?: string; cover?: string; og?: string }

/** Download provider artwork once, store full + thumb (+ logo) in R2, patch the record's artwork keys. */
export async function deriveProviderArtwork(env: Env, recordId: string, job: DeriveJob, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<{ media_id: string; sets: Array<{ at: string[]; value: unknown }> }> {
  let media = await one<{ id: string }>(env.DB, "SELECT id FROM media WHERE record_id = ? AND kind = 'artwork'", recordId);
  if (!media) {
    media = { id: newId('med') };
    await run(env.DB, "INSERT INTO media (id, kind, provider_ref, record_id, approved, created_at) VALUES (?, 'artwork', ?, ?, 1, ?)", media.id, job.poster ?? job.logo ?? null, recordId, now());
  }
  const sets: Array<{ at: string[]; value: unknown }> = [{ at: ['artwork', 'media'], value: media.id }];
  const put = async (variant: 'full' | 'thumb' | 'clip', ref: string, width?: number) => {
    const src = ref.startsWith('url:') ? ref.slice(4) : providerUrl(ref, env.TMDB_IMAGE_URL || undefined);
    if (!src) return;
    const res = await fetchImpl(src, { headers: { 'user-agent': 'loganeastman-worker' } });
    if (!res.ok) throw new Error(`artwork ${res.status} ${src}`);
    let buf = await res.arrayBuffer();
    let ext = (res.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
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
    await put('full', job.poster);
    await put('thumb', job.poster, 400);
  }
  if (job.cover) {
    await put('full', job.cover);
    await put('thumb', job.cover, 400);
  }
  if (job.og) {
    await put('full', job.og);
    await put('thumb', job.og, 400);
  }
  if (job.logo) await put('clip', job.logo);
  await vaultCommit(env, { message: `agent: artwork for ${job.record_path.split('/').pop()?.replace(/\.md$/, '')}`, ops: [{ op: 'setIn', path: job.record_path, sets }], jobId: `media:${recordId}` });
  return { media_id: media.id, sets };
}
