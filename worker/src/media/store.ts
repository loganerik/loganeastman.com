// Media helpers shared by upload, derivation, and the clip providers.
import type { Env } from '../env';
import { newId } from '@lem/vault-core';
import { one, run, now } from '../db';

export async function hash8(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readDims(buf: ArrayBuffer): [number, number] | null {
  const b = new Uint8Array(buf);
  if (b[0] === 0x89 && b[1] === 0x50) return [(b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!, (b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]!];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [(b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!];
      i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    }
  }
  // WebP (VP8X / VP8 / VP8L) — enough for our own derivatives
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    if (b[12] === 0x56 && b[13] === 0x50 && b[14] === 0x38 && b[15] === 0x58) return [1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16))];
  }
  return null;
}

export const contentTypeFor = (ext: string): string => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic' }[ext] ?? 'application/octet-stream');
export const extFor = (ct: string, fallback = 'jpg'): string => (ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : ct.includes('avif') ? 'avif' : ct.includes('heic') ? 'heic' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : fallback);

export interface Variant { url: string; w: number; h: number; key: string; hash: string }

/** Resize through the Images binding when available; otherwise keep the bytes. Stores the variant and records it. */
export async function putVariant(env: Env, mediaId: string, variant: string, buf: ArrayBuffer, srcExt: string, opts: { width?: number; format?: 'webp' | 'png'; provider?: string } = {}): Promise<Variant> {
  let out = buf;
  let ext = srcExt;
  let dims = readDims(buf);
  if (env.IMAGES && (opts.width || opts.format)) {
    try {
      const tr = env.IMAGES.input(new Response(buf).body!);
      const t = opts.width && dims && dims[0] > opts.width ? tr.transform({ width: opts.width }) : tr;
      const fmt = opts.format === 'png' ? 'image/png' : 'image/webp';
      const res = await (await t.output({ format: fmt, quality: 82 })).response();
      out = await res.arrayBuffer();
      ext = opts.format === 'png' ? 'png' : 'webp';
      const d = readDims(out);
      if (d) dims = d;
      else if (dims && opts.width && dims[0] > opts.width) dims = [opts.width, Math.round((dims[1] / dims[0]) * opts.width)];
    } catch {
      /* keep original bytes */
    }
  }
  const h = await hash8(out);
  const key = `derived/${mediaId}/${variant}-${h}.${ext}`;
  await env.MEDIA.put(key, out, { httpMetadata: { contentType: contentTypeFor(ext) } });
  await run(env.DB, 'INSERT OR REPLACE INTO media_variants (media_id, variant, r2_key, hash8, width, height, status, provider, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', mediaId, variant, key, h, dims?.[0] ?? null, dims?.[1] ?? null, 'ready', opts.provider ?? null, now());
  return { url: `/m/${mediaId}/${variant}-${h}.${ext}`, w: dims?.[0] ?? 0, h: dims?.[1] ?? 0, key, hash: h };
}

export async function ensureMedia(env: Env, recordId: string | null, kind: 'photo' | 'artwork' | 'og', providerRef: string | null, origKey: string | null): Promise<string> {
  if (recordId) {
    const m = await one<{ id: string }>(env.DB, 'SELECT id FROM media WHERE record_id = ? AND kind = ?', recordId, kind);
    if (m) return m.id;
  }
  const id = newId('med');
  await run(env.DB, 'INSERT INTO media (id, kind, orig_key, provider_ref, record_id, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, kind, origKey, providerRef, recordId, kind === 'photo' ? 0 : 1, now());
  return id;
}
