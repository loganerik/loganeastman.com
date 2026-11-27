// Transparent cutouts. `replicate` runs in the cloud (works while the Mac sleeps); `local` leaves a pending
// variant for tools/mac/clip to pick up. Either way the finished PNG lands as clip-<hash>.png and the
// record's artwork.clip is patched so every view reuses the same clipping.
import type { Env } from '../env';
import { one, run, now } from '../db';
import { putVariant, readDims } from './store';
import { vaultCommit } from '../do/VaultWriter';

export interface ClipJob { record_path: string | null; media_id: string; provider: 'replicate' | 'openai' | 'local'; params?: Record<string, unknown> } // params.mode: 'cutout' (default) | 'trim' (crop white margins, covers)

/** Which eraser does a cutout: Replicate when configured, else OpenAI's image model, else the Mac. Trims are always the Mac. */
export function clipProvider(env: Env, mode?: string): 'replicate' | 'openai' | 'local' {
  if (mode === 'trim') return 'local';
  if (env.REPLICATE_TOKEN) return 'replicate';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'local';
}

const REPLICATE_MODEL = 'men1scus/birefnet'; // background removal; swap via CLIP_MODEL env if you prefer another

export async function runClipJob(env: Env, job: ClipJob, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<{ status: 'ready' | 'pending' }> {
  // the job may name a media id or a record id (media_attach); resolve to the media row either way
  let m = (await one<{ id: string; orig_key: string | null; record_id: string | null }>(env.DB, 'SELECT id, orig_key, record_id FROM media WHERE id = ?', job.media_id))
    ?? (await one<{ id: string; orig_key: string | null; record_id: string | null }>(env.DB, "SELECT id, orig_key, record_id FROM media WHERE record_id = ? ORDER BY created_at DESC LIMIT 1", job.media_id));
  if (!m) {
    // the record may have been converted (new id): follow its artwork.media reference and relink the media row
    const rec = await one<{ frontmatter_json: string | null }>(env.DB, 'SELECT frontmatter_json FROM records WHERE id = ?', job.media_id);
    const mediaId = (JSON.parse(rec?.frontmatter_json ?? '{}') as { artwork?: { media?: string } }).artwork?.media;
    if (mediaId) {
      m = await one<{ id: string; orig_key: string | null; record_id: string | null }>(env.DB, 'SELECT id, orig_key, record_id FROM media WHERE id = ?', mediaId);
      if (m) { await run(env.DB, 'UPDATE media SET record_id = ? WHERE id = ?', job.media_id, m.id); m.record_id = job.media_id; }
    }
  }
  if (!m) throw new Error('media not found');
  // covers and title art are shown whole; a cutout only happens when the owner set treatment: cutout explicitly
  if (m.record_id) {
    const rec = await one<{ kind: string | null; frontmatter_json: string | null }>(env.DB, 'SELECT kind, frontmatter_json FROM records WHERE id = ?', m.record_id);
    const treatment = (JSON.parse(rec?.frontmatter_json ?? '{}') as { artwork?: { treatment?: string } }).artwork?.treatment;
    if (rec && ['book', 'album', 'film', 'tv'].includes(rec.kind ?? '') && treatment !== 'cutout' && job.params?.mode !== 'trim') {
      await run(env.DB, "UPDATE media_variants SET status = 'failed', params_json = ?, updated_at = ? WHERE media_id = ? AND variant = 'clip'", JSON.stringify({ reason: 'covers and title art are not cut out' }), now(), m.id);
      return { status: 'pending' };
    }
  }
  const provider = job.provider === 'replicate' && !env.REPLICATE_TOKEN ? clipProvider(env) : job.provider === 'openai' && !env.OPENAI_API_KEY ? clipProvider(env) : job.provider;
  if (provider === 'local' || job.params?.mode === 'trim') {
    await run(env.DB, "INSERT OR REPLACE INTO media_variants (media_id, variant, status, provider, params_json, updated_at) VALUES (?, 'clip', 'pending', 'local', ?, ?)", m.id, JSON.stringify(job.params ?? {}), now());
    return { status: 'pending' };
  }
  const srcKey = m.orig_key ?? (await one<{ r2_key: string }>(env.DB, "SELECT r2_key FROM media_variants WHERE media_id = ? AND variant = 'full' AND status = 'ready'", m.id))?.r2_key;
  if (!srcKey) throw new Error('no source image for clip');
  const obj = await env.MEDIA.get(srcKey);
  if (!obj) throw new Error('source object missing');
  const bytes = await obj.arrayBuffer();
  if (provider === 'openai') {
    // OpenAI's image model as the eraser: the subject comes back on a transparent background. High input fidelity
    // keeps lettering and labels as they are. Costs a few cents; on any failure the Mac picks the job up instead.
    try {
      // the preferred model first (OPENAI_IMAGE_MODEL, default gpt-image-1); if the account cannot use it yet
      // (unverified organisation, restricted project) the mini model is tried before giving the job to the Mac
      const preferred = env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
      const models = preferred === 'gpt-image-1-mini' ? [preferred] : [preferred, 'gpt-image-1-mini'];
      const call = fetchImpl;
      let b64: string | undefined;
      let lastErr = '';
      for (const model of models) {
        const form = new FormData();
        form.append('model', model);
        form.append('image', new Blob([bytes], { type: obj.httpMetadata?.contentType ?? 'image/png' }), 'source.png');
        form.append('prompt', 'Remove the background completely so only the main product or subject remains, exactly as photographed: same angle, colours, lettering and details. Nothing added, nothing redrawn. Transparent background.');
        form.append('background', 'transparent');
        form.append('output_format', 'png');
        form.append('quality', 'medium');
        if (model === 'gpt-image-1') form.append('input_fidelity', 'high');
        form.append('size', 'auto');
        const res = await call('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form });
        if (res.ok) {
          const out = (await res.json()) as { data?: Array<{ b64_json?: string }> };
          b64 = out.data?.[0]?.b64_json;
          if (b64) break;
          lastErr = `openai images (${model}): no image in the response`;
          continue;
        }
        const text = (await res.text()).slice(0, 300);
        lastErr = `openai images ${res.status} (${model}): ${text}`;
        if (!/does not exist|not found|not available|verif/i.test(text)) break; // a real error: don't try the other model
      }
      if (!b64) throw new Error(lastErr || 'openai images: nothing returned');
      const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      await finishClip(env, m.id, png, 'openai');
      return { status: 'ready' };
    } catch (e) {
      await run(env.DB, "INSERT OR REPLACE INTO media_variants (media_id, variant, status, provider, params_json, updated_at) VALUES (?, 'clip', 'pending', 'local', ?, ?)", m.id, JSON.stringify({ ...(job.params ?? {}), cloud_error: (e as Error).message.slice(0, 200) }), now());
      return { status: 'pending' };
    }
  }
  // Replicate wants a URL or a data URI; data URIs are fine up to a few MB.
  const dataUri = `data:${obj.httpMetadata?.contentType ?? 'image/jpeg'};base64,${toBase64(bytes)}`;
  const model = env.CLIP_MODEL || REPLICATE_MODEL;
  const res = await fetchImpl(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.REPLICATE_TOKEN}`, 'content-type': 'application/json', prefer: 'wait=60' },
    body: JSON.stringify({ input: { image: dataUri, ...(job.params ?? {}) } }),
  });
  if (!res.ok) throw new Error(`replicate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let pred = (await res.json()) as { id: string; status: string; output?: string | string[]; error?: string; urls?: { get: string } };
  for (let i = 0; i < 20 && (pred.status === 'starting' || pred.status === 'processing'); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await fetchImpl(pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`, { headers: { authorization: `Bearer ${env.REPLICATE_TOKEN}` } });
    pred = (await r2.json()) as typeof pred;
  }
  if (pred.status !== 'succeeded' || !pred.output) throw new Error(`replicate: ${pred.status} ${pred.error ?? ''}`);
  const outUrl = Array.isArray(pred.output) ? pred.output[0]! : pred.output;
  const png = await (await fetchImpl(outUrl)).arrayBuffer();
  await finishClip(env, m.id, png, 'replicate');
  return { status: 'ready' };
}

function toBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Store a finished transparent PNG as the clip variant and patch the owning record. */
export async function finishClip(env: Env, mediaId: string, png: ArrayBuffer, provider: string): Promise<{ url: string; w: number; h: number }> {
  const dims = readDims(png);
  if (!dims) throw new Error('clip must be a PNG');
  // cutouts come back at catalogue resolution; 1200px on the width is plenty for the wall, lists and item pages
  const v = await putVariant(env, mediaId, 'clip', png, 'png', { provider, width: 1200, format: 'png' });
  const m = await one<{ record_id: string | null }>(env.DB, 'SELECT record_id FROM media WHERE id = ?', mediaId);
  const rec = m?.record_id ? await one<{ path: string; frontmatter_json: string | null }>(env.DB, 'SELECT path, frontmatter_json FROM records WHERE id = ?', m.record_id) : null;
  if (rec) {
    // a finished cutout becomes the treatment unless the owner chose a non-photo treatment on purpose
    const current = (JSON.parse(rec.frontmatter_json ?? '{}') as { artwork?: { treatment?: string } }).artwork?.treatment;
    const sets: Array<{ at: string[]; value: unknown }> = [{ at: ['artwork', 'clip'], value: v.url }, { at: ['artwork', 'clip_size'], value: [v.w, v.h] }, { at: ['artwork', 'media'], value: mediaId }];
    if (!current || current === 'paper' || current === 'cutout') sets.push({ at: ['artwork', 'treatment'], value: 'cutout' });
    await vaultCommit(env, { message: `media: cutout for ${rec.path.split('/').pop()}`, ops: [{ op: 'setIn', path: `${rec.path}.md`, sets }] });
  }
  return { url: v.url, w: v.w, h: v.h };
}
