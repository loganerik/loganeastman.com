// Owner photo uploads. Originals stay private in R2 under orig/; small public derivatives go to derived/.
// Two shapes: an inline image for a piece (returns an Obsidian embed) or a photo record for the wall.
import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { requireOwner } from '../auth/access';
import { requireScopes } from '../auth/tokens';
import { newId, itemSlug, itemPath, serializeNote, slugify } from '@lem/vault-core';
import { one, all, run, now, json } from '../db';
import { vaultCommit } from '../do/VaultWriter';
import { vaultFor } from '../vault/github';
import { indexFile } from './github';
import { putVariant, extFor, contentTypeFor, readDims } from '../media/store';
import { enqueue } from '../processor/jobs';

export const assets = new Hono<AppEnv>();

/** Add/replace one attachment entry in the vault's _media/index.json (agent-owned file). */
export async function patchMediaIndex(env: Env, key: string, entry: unknown): Promise<void> {
  const gh = vaultFor(env);
  const cur = await gh.readFile('_media/index.json');
  const idx = (cur ? JSON.parse(cur.text) : { attachments: {} }) as { attachments: Record<string, unknown> };
  idx.attachments ??= {};
  idx.attachments[key] = entry;
  const text = JSON.stringify(idx, null, 2) + '\n';
  if (text === cur?.text) return;
  await vaultCommit(env, { message: `media: index ${key.split('/').pop()}`, ops: [{ op: 'write', path: '_media/index.json', contents: text }] });
}

async function storeUpload(env: Env, file: File, opts: { recordId?: string | null }): Promise<{ media_id: string; orig_key: string; filename: string; thumb: { url: string; w: number; h: number }; full: { url: string; w: number; h: number }; width: number | null; height: number | null }> {
  const ct = file.type || 'image/jpeg';
  const ext = extFor(ct, (file.name.split('.').pop() ?? 'jpg').toLowerCase());
  const safe = slugify(file.name.replace(/\.[^.]+$/, '')) || 'photo';
  const filename = `${safe}.${ext}`;
  const id = newId('med');
  const origKey = `orig/photos/${id}/${filename}`;
  const buf = await file.arrayBuffer();
  const dims = readDims(buf);
  await env.MEDIA.put(origKey, buf, { httpMetadata: { contentType: contentTypeFor(ext) } });
  await run(env.DB, 'INSERT INTO media (id, kind, orig_key, record_id, approved, width, height, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)', id, 'photo', origKey, opts.recordId ?? null, dims?.[0] ?? null, dims?.[1] ?? null, now());
  const full = await putVariant(env, id, 'full', buf, ext, { width: 1600, format: 'webp' });
  const thumb = await putVariant(env, id, 'thumb', buf, ext, { width: 800, format: 'webp' });
  return { media_id: id, orig_key: origKey, filename, thumb, full, width: dims?.[0] ?? null, height: dims?.[1] ?? null };
}

/** Inline image for a piece: stores the original, derives, updates _media/index.json, returns an embed. */
assets.post('/api/assets', requireOwner, async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ error: 'multipart field "file" required' }, 400);
  if (!/^image\//.test(file.type)) return c.json({ error: 'images only' }, 400);
  const alt = String(form?.get('alt') ?? '');
  const s = await storeUpload(c.env, file, { recordId: String(form?.get('record_id') ?? '') || null });
  const vaultPath = `attachments/orig/photos/${s.media_id}/${s.filename}`;
  await patchMediaIndex(c.env, vaultPath, { media: s.media_id, alt: alt || undefined, variants: { thumb: { url: s.thumb.url, w: s.thumb.w, h: s.thumb.h }, full: { url: s.full.url, w: s.full.w, h: s.full.h } } });
  return c.json({ media_id: s.media_id, path: vaultPath, embed: `![[photos/${s.media_id}/${s.filename}${alt ? '|' + alt : ''}]]`, thumb: s.thumb, full: s.full, approved: false, note: 'Attachments inside a public piece are public once the piece is; the original stays private.' }, 201);
});

/** A photo for the wall: creates items/photos/<slug>.md (approved: false until you say so). */
assets.post('/api/photos', requireOwner, async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ error: 'multipart field "file" required' }, 400);
  if (!/^image\//.test(file.type)) return c.json({ error: 'images only' }, 400);
  const title = String(form?.get('title') ?? '').trim() || file.name.replace(/\.[^.]+$/, '');
  const why = String(form?.get('why') ?? '').trim();
  const treatment = String(form?.get('treatment') ?? 'cutout');
  const visibility = form?.get('visibility') === 'private' ? 'private' : 'public';
  const t = now();
  const id = newId('photo');
  const s = await storeUpload(c.env, file, { recordId: id });
  const vaultPath = `attachments/orig/photos/${s.media_id}/${s.filename}`;
  const slug = itemSlug(title, Number(t.slice(0, 4)));
  const path = itemPath('photo', slug);
  const fm: Record<string, unknown> = { id, type: 'item', kind: 'photo', title, year: Number(t.slice(0, 4)), visibility, approved: false, taken: t, media: s.media_id, original: vaultPath,
    artwork: { treatment, media: s.media_id, thumb: s.thumb.url, thumb_size: [s.thumb.w, s.thumb.h], full: s.full.url, full_size: [s.full.w, s.full.h] }, tags: [], related: [], locked: [], created: t };
  const commit = await vaultCommit(c.env, { message: `photo: ${title}`, ops: [{ op: 'create', path, contents: serializeNote(fm, why), ifAbsent: true }] });
  if (commit.results[0]?.status === 'skipped') return c.json({ error: `a photo already exists at ${path}` }, 409);
  await patchMediaIndex(c.env, vaultPath, { media: s.media_id, record: id, variants: { thumb: { url: s.thumb.url, w: s.thumb.w, h: s.thumb.h }, full: { url: s.full.url, w: s.full.w, h: s.full.h } } });
  const fresh = await vaultFor(c.env).readFile(path);
  if (fresh) await indexFile(c.env, path, fresh.text, fresh.sha);
  if (treatment === 'cutout') await enqueue(c.env, 'derive_clip', s.media_id, `clip:${s.media_id}:1`, { record_path: path, media_id: s.media_id, provider: c.env.REPLICATE_TOKEN ? 'replicate' : 'local' });
  return c.json({ id, path: path.replace(/\.md$/, ''), media_id: s.media_id, thumb: s.thumb, full: s.full, approved: false, edit: `/private/edit/?id=${id}` }, 201);
});

/** Approve a photo for public use (sets approved: true in the record). */
assets.post('/api/photos/:id/approve', requireOwner, async (c) => {
  const row = await one<{ id: string; path: string }>(c.env.DB, "SELECT id, path FROM records WHERE id = ? AND kind = 'photo'", c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  const approved = (await c.req.json().catch(() => ({ approved: true }))) as { approved?: boolean };
  await vaultCommit(c.env, { message: `photo: ${approved.approved === false ? 'unapprove' : 'approve'} ${row.path.split('/').pop()}`, ops: [{ op: 'setKeys', path: `${row.path}.md`, keys: { approved: approved.approved !== false } }] });
  await run(c.env.DB, 'UPDATE media SET approved = ? WHERE record_id = ?', approved.approved !== false ? 1 : 0, row.id);
  const fresh = await vaultFor(c.env).readFile(`${row.path}.md`);
  if (fresh) await indexFile(c.env, `${row.path}.md`, fresh.text, fresh.sha);
  return c.json({ ok: true });
});

/** Owner-only: the private original (for the local cutout tool and the editor's cover picker). */
assets.get('/api/media/:id/original', requireScopes('media:write'), async (c) => {
  const m = await one<{ orig_key: string | null; provider_ref: string | null }>(c.env.DB, 'SELECT orig_key, provider_ref FROM media WHERE id = ?', c.req.param('id'));
  if (!m) return c.json({ error: 'not found' }, 404);
  const key = m.orig_key ?? (await one<{ r2_key: string }>(c.env.DB, "SELECT r2_key FROM media_variants WHERE media_id = ? AND variant = 'full' AND status = 'ready'", c.req.param('id')))?.r2_key;
  if (!key) return c.json({ error: 'no original stored' }, 404);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.json({ error: 'object missing' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(obj.body, { headers });
});

/** Media the local tool should cut out, oldest first. */
assets.get('/api/media/clip-queue', requireScopes('media:write'), async (c) => {
  const rows = await all<{ id: string; kind: string; record_id: string | null; media_id: string; params_json: string | null }>(c.env.DB,
    "SELECT m.id, m.kind, m.record_id, v.media_id, v.params_json FROM media_variants v JOIN media m ON m.id = v.media_id WHERE v.variant = 'clip' AND v.status = 'pending' AND v.provider = 'local' ORDER BY v.updated_at LIMIT 20");
  return c.json({ queue: rows.map((r) => ({ media_id: r.id, record_id: r.record_id, original: `/api/media/${r.id}/original`, upload: `/api/media/${r.id}/variants/clip`, params: json(r.params_json, {}) })) });
});

/** Upload a finished clip (transparent PNG) for a media id; the record's artwork.clip is patched. */
assets.post('/api/media/:id/variants/clip', requireScopes('media:write'), async (c) => {
  const id = c.req.param('id');
  const m = await one<{ id: string; record_id: string | null }>(c.env.DB, 'SELECT id, record_id FROM media WHERE id = ?', id);
  if (!m) return c.json({ error: 'not found' }, 404);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ error: 'multipart field "file" (PNG) required' }, 400);
  const { finishClip } = await import('../media/clip');
  const v = await finishClip(c.env, id, await file.arrayBuffer(), String(form?.get('provider') ?? 'local'));
  return c.json({ ok: true, clip: v });
});

/** Ask for a new cutout (a poor extraction can be replaced any time). */
assets.post('/api/media/:id/variants/clip/regenerate', requireScopes('media:write'), async (c) => {
  const id = c.req.param('id');
  const m = await one<{ id: string; record_id: string | null }>(c.env.DB, 'SELECT id, record_id FROM media WHERE id = ?', id);
  if (!m) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { provider?: 'replicate' | 'local'; params?: Record<string, unknown>; mode?: 'cutout' | 'trim' };
  if (body.mode === 'trim') body.params = { ...(body.params ?? {}), mode: 'trim' };
  const provider = body.params?.mode === 'trim' ? 'local' : body.provider ?? (c.env.REPLICATE_TOKEN ? 'replicate' : 'local');
  const rec = m.record_id ? await one<{ path: string }>(c.env.DB, 'SELECT path FROM records WHERE id = ?', m.record_id) : null;
  const n = ((await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM jobs WHERE kind = 'derive_clip' AND subject_id = ?", id))?.n ?? 0) + 1;
  await run(c.env.DB, "INSERT OR REPLACE INTO media_variants (media_id, variant, status, provider, params_json, updated_at) VALUES (?, 'clip', 'pending', ?, ?, ?)", id, provider, JSON.stringify(body.params ?? {}), now());
  await enqueue(c.env, 'derive_clip', id, `clip:${id}:${n}`, { record_path: rec ? `${rec.path}.md` : null, media_id: id, provider, params: body.params ?? {} });
  return c.json({ ok: true, provider, queued: provider === 'local' ? 'waiting for the Mac' : 'running' });
});

assets.get('/api/media', requireOwner, async (c) => {
  const rows = await all(c.env.DB, "SELECT m.*, (SELECT json_group_array(json_object('variant', v.variant, 'status', v.status, 'url', CASE WHEN v.r2_key IS NULL THEN NULL ELSE '/m/' || substr(v.r2_key, 9) END, 'provider', v.provider)) FROM media_variants v WHERE v.media_id = m.id) AS variants FROM media m ORDER BY created_at DESC LIMIT 200");
  return c.json({ media: rows });
});

/** The vault's _media/index.json (attachment path → public variants), for the editor's cover picker. */
assets.get('/api/media/index', requireScopes('media:write'), async (c) => {
  const blob = await vaultFor(c.env).readFile('_media/index.json');
  return c.json(blob ? JSON.parse(blob.text) : { attachments: {} });
});

/** The local tool found nothing to cut out: record it so the queue stops offering this media. */
assets.post('/api/media/:id/variants/clip/failed', requireScopes('media:write'), async (c) => {
  const id = c.req.param('id');
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  await run(c.env.DB, "UPDATE media_variants SET status = 'failed', params_json = ?, updated_at = ? WHERE media_id = ? AND variant = 'clip'", JSON.stringify({ reason: reason ?? 'failed' }), now(), id);
  return c.json({ ok: true });
});
