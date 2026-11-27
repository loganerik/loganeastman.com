// GitHub push webhook from the vault repo: re-index changed records, then ask the site repo to rebuild.
import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { vaultFor } from '../vault/github';
import { parseNote, validateRecord, hasConflictMarkers, normalizeTarget } from '@lem/vault-core';
import { run, now, all } from '../db';
import { requireOwner } from '../auth/access';
import { purgeUrls, urlsForRecord } from '../media/purge';

export const github = new Hono<AppEnv>();

async function verify(secret: string, body: string, sig: string | undefined): Promise<boolean> {
  if (!sig?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const a = new TextEncoder().encode(hex), b = new TextEncoder().encode(sig.slice(7));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Parse one vault file into the records index (and identities). Returns the record id or null. */
export async function indexFile(env: Env, path: string, text: string, sha: string | null): Promise<{ id: string | null; visibility: string | null; conflict: boolean }> {
  const p = normalizeTarget(path);
  if (path.startsWith('_config/') || !path.endsWith('.md')) return { id: null, visibility: null, conflict: false };
  const conflict = hasConflictMarkers(text);
  const note = parseNote(text);
  const v = validateRecord(note.frontmatter);
  if (!v.ok) {
    if (conflict && typeof note.frontmatter.id === 'string') await run(env.DB, 'UPDATE records SET conflict = 1, indexed_at = ? WHERE id = ?', now(), note.frontmatter.id);
    return { id: null, visibility: null, conflict };
  }
  const d = v.data as Record<string, unknown>;
  const title = (d.title as string) ?? (d.name as string) ?? null;
  await run(env.DB, 'INSERT OR REPLACE INTO records (id, path, type, kind, title, visibility, blob_sha, conflict, frontmatter_json, body_excerpt, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    d.id, p, d.type, (d.kind as string) ?? null, title, (d.visibility as string) ?? 'public', sha, conflict ? 1 : 0, JSON.stringify(d), note.body.trim().slice(0, 300), now());
  if (d.type === 'item') {
    if (d.tmdb_id) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', 'tmdb', String(d.tmdb_id), d.id);
    if (d.imdb_id) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', 'imdb', String(d.imdb_id), d.id);
    if (d.openlibrary_id) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', 'openlibrary', String(d.openlibrary_id), d.id);
    if (d.isbn13) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', 'isbn', String(d.isbn13), d.id);
    if (d.musicbrainz_rg) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', 'musicbrainz', String(d.musicbrainz_rg), d.id);
  }
  return { id: d.id as string, visibility: (d.visibility as string) ?? 'public', conflict };
}

export async function reindexPaths(env: Env, changed: string[], removed: string[]): Promise<{ indexed: number; removed: number; flipped: string[] }> {
  const gh = vaultFor(env);
  const flipped: string[] = [];
  const before = new Map((await all<{ path: string; visibility: string }>(env.DB, 'SELECT path, visibility FROM records')).map((r) => [r.path, r.visibility]));
  let indexed = 0;
  for (let i = 0; i < changed.length; i += 20) {
    const batch = changed.slice(i, i + 20);
    const blobs = await gh.readMany(batch);
    for (const p of batch) {
      const b = blobs.get(p);
      if (!b) continue;
      const r = await indexFile(env, p, b.text, b.sha);
      if (r.id) indexed++;
      const prev = before.get(normalizeTarget(p));
      if (prev && r.visibility && prev !== r.visibility) flipped.push(normalizeTarget(p));
    }
  }
  for (const p of removed) await run(env.DB, 'DELETE FROM records WHERE path = ?', normalizeTarget(p));
  return { indexed, removed: removed.length, flipped };
}

export async function reindexAll(env: Env): Promise<{ indexed: number }> {
  const gh = vaultFor(env);
  const files = await gh.listMarkdown();
  const paths = files.map((f) => f.path).filter((p) => p.endsWith('.md'));
  const r = await reindexPaths(env, paths, []);
  // drop index rows for files that no longer exist
  const keep = new Set(paths.map(normalizeTarget));
  for (const row of await all<{ path: string }>(env.DB, 'SELECT path FROM records')) if (!keep.has(row.path)) await run(env.DB, 'DELETE FROM records WHERE path = ?', row.path);
  return { indexed: r.indexed };
}

export async function dispatchBuild(env: Env, reason: string): Promise<void> {
  if (!env.GITHUB_TOKEN) return;
  await vaultFor(env).dispatch(env.SITE_REPO, 'vault-updated', { reason, at: now() });
}

github.post('/api/github/webhook', async (c) => {
  const body = await c.req.text();
  if (!c.env.GITHUB_WEBHOOK_SECRET || !(await verify(c.env.GITHUB_WEBHOOK_SECRET, body, c.req.header('x-hub-signature-256')))) return c.json({ error: 'bad signature' }, 401);
  const event = c.req.header('x-github-event');
  if (event === 'ping') return c.json({ ok: true });
  if (event !== 'push') return c.json({ ok: true, ignored: event });
  const payload = JSON.parse(body) as { ref: string; before?: string; after?: string; commits: Array<{ added: string[]; modified: string[]; removed: string[]; message: string }>; repository: { full_name: string } };
  if (payload.ref !== `refs/heads/${c.env.VAULT_BRANCH}` || payload.repository.full_name !== c.env.VAULT_REPO) return c.json({ ok: true, ignored: payload.ref });
  const changed = new Set<string>(), removed = new Set<string>();
  let listed = 0;
  for (const cm of payload.commits) {
    listed += cm.added.length + cm.modified.length + cm.removed.length;
    for (const p of [...cm.added, ...cm.modified]) if (p.endsWith('.md')) { changed.add(p); removed.delete(p); }
    for (const p of cm.removed) if (p.endsWith('.md')) { removed.add(p); changed.delete(p); }
  }
  // GitHub truncates a push payload's file lists on big pushes (an import, a bulk edit): ask the compare API for the real diff
  let full = false;
  if (listed >= 20 && payload.before && payload.after && !/^0+$/.test(payload.before)) {
    try {
      const cmp = await vaultFor(c.env).rest<{ files?: Array<{ filename: string; status: string; previous_filename?: string }> }>(`/repos/${c.env.VAULT_REPO}/compare/${payload.before}...${payload.after}`);
      if (cmp.files && cmp.files.length < 300) {
        changed.clear(); removed.clear();
        for (const f of cmp.files) {
          if (f.status === 'removed') { if (f.filename.endsWith('.md')) removed.add(f.filename); continue; }
          if (f.status === 'renamed' && f.previous_filename?.endsWith('.md')) removed.add(f.previous_filename);
          if (f.filename.endsWith('.md')) changed.add(f.filename);
        }
      } else full = true; // more than the compare API lists: reindex everything
    } catch { full = true; }
  }
  c.executionCtx.waitUntil((async () => {
    const r = full ? { ...(await reindexAll(c.env)), flipped: [] as string[] } : await reindexPaths(c.env, [...changed], [...removed]);
    await c.env.KV.delete(`vault-config:${c.env.VAULT_BRANCH}`).catch(() => {});
    await dispatchBuild(c.env, 'vault push').catch(() => {});
    if (r.flipped.length) {
      const rows = await all<{ type: string; kind: string | null; path: string; frontmatter_json: string | null }>(c.env.DB, `SELECT type, kind, path, frontmatter_json FROM records WHERE path IN (${r.flipped.map(() => '?').join(',')})`, ...r.flipped);
      await purgeUrls(c.env, rows.flatMap((row) => urlsForRecord(c.env, row)));
    }
  })());
  return c.json({ ok: true, changed: changed.size, removed: removed.size });
});

github.post('/api/reindex', requireOwner, async (c) => c.json(await reindexAll(c.env)));
github.post('/api/rebuild', requireOwner, async (c) => {
  await dispatchBuild(c.env, 'manual');
  return c.json({ ok: true });
});
