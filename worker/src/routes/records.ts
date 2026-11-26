// Owner-facing records API used by the editor and the private hub. Every save carries the blob sha it was
// loaded from; a mismatch returns 409 with the current file so the editor can merge, never overwrite.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { one, all, run, now, json } from '../db';
import { vaultFor } from '../vault/github';
import { vaultCommit } from '../do/VaultWriter';
import { indexFile } from './github';
import { parseNote, serializeNote, validateRecord, siteConfigSchema, collectionsConfigSchema, listTypesConfigSchema, newId, slugify, itemSlug, datedSlug, itemPath, listPath, listEntryPath, feedPath, reviewPath, writingPath, normalizeTarget, conflictSides, resolveConflict, parseConflict, hasConflictMarkers, type ItemKind } from '@lem/vault-core';
import { loadVaultConfig } from '../vault/config';

export const records = new Hono<AppEnv>();

interface RecordRow { id: string; path: string; type: string; kind: string | null; title: string | null; visibility: string | null; blob_sha: string | null; conflict: number; frontmatter_json: string | null; body_excerpt: string | null; indexed_at: string }

const slim = (r: RecordRow) => {
  const fm = json<Record<string, unknown>>(r.frontmatter_json, {});
  return { id: r.id, path: r.path, type: r.type, kind: r.kind, title: r.title, visibility: r.visibility, draft: !!fm.draft, date: fm.date ?? fm.created ?? null, collection: fm.collection ?? null, list_type: fm.list_type ?? null, year: fm.year ?? null, conflict: !!r.conflict, excerpt: r.body_excerpt, tags: fm.tags ?? [], indexed_at: r.indexed_at };
};

records.get('/api/records', requireOwner, async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.type) { where.push('type = ?'); binds.push(q.type); }
  if (q.kind) { where.push('kind = ?'); binds.push(q.kind); }
  if (q.visibility) { where.push('visibility = ?'); binds.push(q.visibility); }
  if (q.status === 'draft') where.push("json_extract(frontmatter_json, '$.draft') = 1");
  if (q.status === 'published') where.push("visibility = 'public' AND (json_extract(frontmatter_json, '$.draft') IS NULL OR json_extract(frontmatter_json, '$.draft') = 0)");
  if (q.conflict === '1') where.push('conflict = 1');
  if (q.q) { where.push('(title LIKE ? OR path LIKE ? OR body_excerpt LIKE ?)'); binds.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  const limit = Math.min(Number(q.limit ?? 100), 500);
  const rows = await all<RecordRow>(c.env.DB, `SELECT * FROM records ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(json_extract(frontmatter_json, '$.date'), json_extract(frontmatter_json, '$.created'), indexed_at) DESC LIMIT ?`, ...binds, limit);
  return c.json({ records: rows.map(slim) });
});

records.get('/api/index/:what', requireOwner, async (c) => {
  const what = c.req.param('what');
  if (what === 'tags') {
    const rows = await all<{ tag: string; n: number }>(c.env.DB, "SELECT j.value AS tag, COUNT(*) AS n FROM records, json_each(json_extract(records.frontmatter_json, '$.tags')) j GROUP BY j.value ORDER BY n DESC");
    const tagRecords = await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'tag'");
    return c.json({ tags: rows.map((r) => ({ tag: r.tag, count: r.n, private: r.tag.startsWith('private') || tagRecords.some((t) => t.title === r.tag && t.visibility === 'private') })) });
  }
  if (what === 'people') return c.json({ people: (await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'person' ORDER BY title")).map(slim) });
  if (what === 'lists') return c.json({ lists: (await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'list' ORDER BY title")).map(slim) });
  return c.json({ error: 'unknown index' }, 404);
});

records.get('/api/config', requireOwner, async (c) => c.json(await loadVaultConfig(c.env, { fresh: c.req.query('fresh') === '1' })));

records.get('/api/records/:id', requireOwner, async (c) => {
  const row = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ? OR path = ?', c.req.param('id'), normalizeTarget(c.req.param('id')));
  if (!row) return c.json({ error: 'not found' }, 404);
  const blob = await vaultFor(c.env).readFile(`${row.path}.md`);
  if (!blob) return c.json({ error: 'file missing in vault' }, 404);
  const note = parseNote(blob.text);
  const conflict = hasConflictMarkers(blob.text) ? { ...conflictSides(blob.text), hunks: parseConflict(blob.text).hunks } : null;
  return c.json({ id: row.id, path: row.path, type: row.type, frontmatter: note.frontmatter, body: note.body, raw: blob.text, sha: blob.sha, conflict });
});

const saveInput = z.object({ frontmatter: z.record(z.string(), z.unknown()).optional(), body: z.string().optional(), raw: z.string().optional(), base_sha: z.string().optional(), message: z.string().max(200).optional() });

records.put('/api/records/:id', requireOwner, async (c) => {
  const parsed = saveInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
  const row = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  const file = `${row.path}.md`;
  const { frontmatter, body, raw, base_sha, message } = parsed.data;
  let contents: string;
  if (typeof raw === 'string') contents = raw;
  else {
    if (!frontmatter) return c.json({ error: 'frontmatter or raw required' }, 400);
    const fm = { ...frontmatter, id: row.id, updated: now() };
    const v = validateRecord(fm);
    if (!v.ok) return c.json({ error: v.error }, 400);
    contents = serializeNote(fm, body ?? '');
  }
  if (hasConflictMarkers(contents)) return c.json({ error: 'the text still contains conflict markers' }, 400);
  const commit = await vaultCommit(c.env, { message: message ?? `edit: ${row.title ?? row.path}`, ops: [{ op: 'write', path: file, contents, baseSha: base_sha }] });
  const r = commit.results[0];
  if (r?.status === 'conflict') {
    const current = await vaultFor(c.env).readFile(file);
    const note = parseNote(current?.text ?? '');
    return c.json({ error: 'changed since you loaded it', current: { frontmatter: note.frontmatter, body: note.body, raw: current?.text, sha: current?.sha } }, 409);
  }
  const fresh = await vaultFor(c.env).readFile(file);
  if (fresh) await indexFile(c.env, file, fresh.text, fresh.sha);
  return c.json({ ok: true, sha: fresh?.sha ?? null, commit: commit.oid, status: r?.status });
});

const createInput = z.object({
  type: z.enum(['writing', 'feed', 'review', 'list', 'list-entry', 'item', 'person', 'tag']),
  frontmatter: z.record(z.string(), z.unknown()).default({}),
  body: z.string().default(''),
});

/** Create a record with a generated id and the conventional path for its type. Returns the record ready to edit. */
records.post('/api/records', requireOwner, async (c) => {
  const parsed = createInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
  const { type, body } = parsed.data;
  const fm: Record<string, unknown> = { ...parsed.data.frontmatter };
  const t = now();
  const day = t.slice(0, 10);
  const cfg = await loadVaultConfig(c.env);
  let path: string;
  const title = String(fm.title ?? fm.name ?? '').trim();
  switch (type) {
    case 'writing': {
      const coll = cfg.collections.find((x) => x.key === fm.collection) ?? cfg.collections[0];
      if (!coll) return c.json({ error: 'no writing collection configured' }, 400);
      fm.id = newId('post'); fm.type = 'writing'; fm.collection = coll.key; fm.title = title || 'Untitled'; fm.date ??= day; fm.draft ??= true; fm.visibility ??= 'public';
      path = writingPath(coll.path ?? `writing/${coll.key}`, String(fm.date), slugify(String(fm.title)) || String(fm.id).slice(5));
      break;
    }
    case 'feed':
      fm.id = newId('feed'); fm.type = 'feed'; fm.date ??= t; fm.visibility ??= 'public';
      path = feedPath(String(fm.date), String(fm.id));
      break;
    case 'review': {
      fm.id = newId('review'); fm.type = 'review'; fm.date ??= day; fm.draft ??= true; fm.visibility ??= 'public';
      if (!fm.item) return c.json({ error: 'review needs item' }, 400);
      const it = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ? OR path = ?', String(fm.item), normalizeTarget(String(fm.item).replace(/^\[\[|\]\]$/g, '')));
      if (!it) return c.json({ error: 'item not found' }, 404);
      fm.item = `[[${it.path}]]`;
      path = reviewPath(String(fm.date), it.path.split('/').pop()!);
      break;
    }
    case 'list': {
      const lt = cfg.listTypes.find((x) => x.key === fm.list_type) ?? cfg.listTypes[0];
      if (!lt) return c.json({ error: 'no list types configured' }, 400);
      fm.id = newId('list'); fm.type = 'list'; fm.list_type = lt.key; fm.title = title || lt.title; fm.visibility ??= lt.private_default ? 'private' : 'public'; fm.sort ??= 'added-desc';
      path = listPath(slugify(String(fm.title)) || lt.key);
      break;
    }
    case 'list-entry': {
      const list = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ? OR path = ?', String(fm.list ?? ''), normalizeTarget(String(fm.list ?? '').replace(/^\[\[|\]\]$/g, '')));
      const it = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ? OR path = ?', String(fm.item ?? ''), normalizeTarget(String(fm.item ?? '').replace(/^\[\[|\]\]$/g, '')));
      if (!list || !it) return c.json({ error: 'list and item required' }, 400);
      fm.id = newId('entry'); fm.type = 'list-entry'; fm.list = `[[${list.path}]]`; fm.item = `[[${it.path}]]`; fm.added ??= day; fm.state ??= 'active'; fm.visibility ??= list.visibility ?? 'public';
      path = listEntryPath(list.path.split('/').pop()!, it.path.split('/').pop()!);
      break;
    }
    case 'item': {
      const kind = String(fm.kind ?? 'link') as ItemKind;
      if (!title) return c.json({ error: 'item needs a title' }, 400);
      fm.id = newId(kind); fm.type = 'item'; fm.kind = kind; fm.title = title; fm.visibility ??= 'public';
      path = itemPath(kind, itemSlug(title, typeof fm.year === 'number' ? fm.year : undefined));
      break;
    }
    case 'person':
      if (!title) return c.json({ error: 'person needs a name' }, 400);
      fm.id = newId('person'); fm.type = 'person'; fm.name = title; delete fm.title; fm.visibility ??= 'private';
      path = `people/${slugify(title)}.md`;
      break;
    case 'tag':
      if (!title) return c.json({ error: 'tag needs a name' }, 400);
      fm.id = newId('tag'); fm.type = 'tag'; fm.name = title; delete fm.title; fm.visibility ??= 'public';
      path = `tags/${slugify(title)}.md`;
      break;
  }
  fm.created = t;
  const v = validateRecord(fm);
  if (!v.ok) return c.json({ error: v.error }, 400);
  const contents = serializeNote(fm, body);
  const commit = await vaultCommit(c.env, { message: `new ${type}: ${title || fm.id}`, ops: [{ op: 'create', path, contents, ifAbsent: true }] });
  if (commit.results[0]?.status === 'skipped') return c.json({ error: `a file already exists at ${path}` }, 409);
  const fresh = await vaultFor(c.env).readFile(path);
  if (fresh) await indexFile(c.env, path, fresh.text, fresh.sha);
  return c.json({ id: fm.id, path: normalizeTarget(path), sha: fresh?.sha ?? null, frontmatter: fm, body }, 201);
});

records.delete('/api/records/:id', requireOwner, async (c) => {
  const row = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  await vaultCommit(c.env, { message: `delete: ${row.title ?? row.path}`, ops: [{ op: 'delete', path: `${row.path}.md` }] });
  await run(c.env.DB, 'DELETE FROM records WHERE id = ?', row.id);
  return c.json({ ok: true });
});

/** Resolve a conflicted file: choices per hunk, or a full raw replacement. */
records.post('/api/records/:id/resolve', requireOwner, async (c) => {
  const row = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  const file = `${row.path}.md`;
  const blob = await vaultFor(c.env).readFile(file);
  if (!blob) return c.json({ error: 'file missing' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { choices?: Array<'ours' | 'theirs' | 'both' | { text: string }>; raw?: string };
  const contents = typeof body.raw === 'string' ? body.raw : resolveConflict(parseConflict(blob.text), body.choices ?? []);
  if (hasConflictMarkers(contents)) return c.json({ error: 'still conflicted' }, 400);
  const commit = await vaultCommit(c.env, { message: `resolve: ${row.title ?? row.path}`, ops: [{ op: 'write', path: file, contents, baseSha: blob.sha }] });
  const fresh = await vaultFor(c.env).readFile(file);
  if (fresh) await indexFile(c.env, file, fresh.text, fresh.sha);
  return c.json({ ok: true, commit: commit.oid });
});

// ---- suggestions & dismissals ----
records.get('/api/suggestions', requireOwner, async (c) => {
  const rows = await all<{ id: string; from_id: string; to_id: string; kind: string; reason: string | null; confidence: number; created_at: string; from_title: string | null; to_title: string | null; from_path: string; to_path: string }>(c.env.DB,
    "SELECT s.*, a.title AS from_title, a.path AS from_path, b.title AS to_title, b.path AS to_path FROM suggestions s LEFT JOIN records a ON a.id = s.from_id LEFT JOIN records b ON b.id = s.to_id WHERE s.status = 'open' ORDER BY s.created_at DESC");
  return c.json({ suggestions: rows });
});
records.post('/api/suggestions/:id/:verb', requireOwner, async (c) => {
  const s = await one<{ id: string; from_id: string; to_id: string; kind: string; reason: string | null }>(c.env.DB, 'SELECT * FROM suggestions WHERE id = ?', c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  const verb = c.req.param('verb');
  if (verb === 'dismiss') {
    await run(c.env.DB, "UPDATE suggestions SET status = 'dismissed' WHERE id = ?", s.id);
    await run(c.env.DB, 'INSERT OR REPLACE INTO dismissals (from_id, to_id, kind, dismissed_at) VALUES (?, ?, ?, ?)', s.from_id, s.to_id, s.kind, now());
    return c.json({ ok: true });
  }
  if (verb === 'accept') {
    const { callTool } = await import('../tools');
    await callTool({ env: c.env, principal: c.get('principal')! }, 'records_link', { from_id: s.from_id, to_id: s.to_id, kind: s.kind, note: s.reason ?? undefined, mode: 'related' });
    await run(c.env.DB, "UPDATE suggestions SET status = 'accepted' WHERE id = ?", s.id);
    return c.json({ ok: true });
  }
  return c.json({ error: 'verb must be accept or dismiss' }, 400);
});

// ---- config notes: _config/site|collections|list-types, edited as raw text ----
const CONFIG_FILES: Record<string, string> = { site: '_config/site.md', collections: '_config/collections.md', 'list-types': '_config/list-types.md' };
records.get('/api/config/raw/:name', requireOwner, async (c) => {
  const file = CONFIG_FILES[c.req.param('name')];
  if (!file) return c.json({ error: 'unknown config' }, 404);
  const blob = await vaultFor(c.env).readFile(file);
  return c.json({ path: file, raw: blob?.text ?? '', sha: blob?.sha ?? null });
});
records.put('/api/config/raw/:name', requireOwner, async (c) => {
  const file = CONFIG_FILES[c.req.param('name')];
  if (!file) return c.json({ error: 'unknown config' }, 404);
  const { raw, base_sha } = (await c.req.json().catch(() => ({}))) as { raw?: string; base_sha?: string };
  if (typeof raw !== 'string') return c.json({ error: 'raw required' }, 400);
  const fm = parseNote(raw).frontmatter;
  try {
    if (file.endsWith('collections.md')) collectionsConfigSchema.parse(fm);
    else if (file.endsWith('list-types.md')) listTypesConfigSchema.parse(fm);
    else siteConfigSchema.parse(fm);
  } catch (e) {
    return c.json({ error: `invalid config: ${(e as Error).message.slice(0, 300)}` }, 400);
  }
  const commit = await vaultCommit(c.env, { message: `config: ${file.split('/').pop()}`, ops: [{ op: 'write', path: file, contents: raw, baseSha: base_sha }] });
  if (commit.results[0]?.status === 'conflict') return c.json({ error: 'changed since you loaded it' }, 409);
  await c.env.KV.delete(`vault-config:${c.env.VAULT_BRANCH}`).catch(() => {});
  return c.json({ ok: true, commit: commit.oid });
});
