import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { reindexAll } from '../routes/github';
import { completeEntry } from '../routes/complete';
import { one, all, run, now, json } from '../db';
import { vaultFor } from '../vault/github';
import { parseNote, formatWikilink, normalizeTarget } from '@lem/vault-core';
import { vaultCommit } from '../do/VaultWriter';
import { enrich, type Identity } from '../processor/enrich';
import { Tmdb, OpenLibrary, MusicBrainz, judge } from '@lem/providers';
import { enqueue } from '../processor/jobs';
import { loadVaultConfig } from '../vault/config';

interface RecordRow { id: string; path: string; type: string; kind: string | null; title: string | null; visibility: string | null; blob_sha: string | null; conflict: number; frontmatter_json: string | null }

export const recordsSearch = defineTool({
  name: 'records_search',
  description: 'Find records by text, type/kind, or a provider id (e.g. tmdb 549509). Includes private records.',
  input: z.object({ q: z.string().optional(), type: z.string().optional(), kind: z.string().optional(), provider: z.string().optional(), external_id: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }),
  scopes: ['records:read'],
  async handler({ env }, { q, type, kind, provider, external_id, limit }) {
    if (provider && external_id) {
      const r = await one<RecordRow>(env.DB, 'SELECT r.* FROM record_identities i JOIN records r ON r.id = i.record_id WHERE i.provider = ? AND i.external_id = ?', provider, external_id);
      return { records: r ? [slim(r)] : [] };
    }
    const where: string[] = [];
    const binds: unknown[] = [];
    if (type) { where.push('type = ?'); binds.push(type); }
    if (kind) { where.push('kind = ?'); binds.push(kind); }
    if (q) { where.push('(instr(lower(title), ?) > 0 OR instr(path, ?) > 0 OR instr(lower(body_excerpt), ?) > 0)'); binds.push(q.toLowerCase(), q.toLowerCase(), q.toLowerCase()); }
    const rows = await all<RecordRow>(env.DB, `SELECT * FROM records ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY indexed_at DESC LIMIT ?`, ...binds, limit);
    return { records: rows.map(slim) };
  },
});

function slim(r: RecordRow) {
  const fm = json<Record<string, unknown>>(r.frontmatter_json, {});
  return { id: r.id, path: r.path, type: r.type, kind: r.kind, title: r.title, visibility: r.visibility, year: fm.year, conflict: !!r.conflict };
}

export const recordsRead = defineTool({
  name: 'records_read',
  description: 'Read one record (frontmatter + body + blob sha) straight from the vault.',
  input: z.object({ record_id: z.string().optional(), path: z.string().optional() }),
  scopes: ['records:read'],
  async handler({ env }, { record_id, path }) {
    const row = record_id ? await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ?', record_id) : path ? await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', normalizeTarget(path)) : null;
    if (!row) throw new ToolError('record not found', 404);
    const blob = await vaultFor(env).readFile(`${row.path}.md`);
    if (!blob) throw new ToolError('file missing in vault', 404);
    const note = parseNote(blob.text);
    return { id: row.id, path: row.path, frontmatter: note.frontmatter, body: note.body, blob_sha: blob.sha };
  },
});

export const itemEnrich = defineTool({
  name: 'item_enrich',
  description: 'Refresh sourced facts (director, cast, synopsis, release dates, artwork refs) for an item from its provider. Honors locked keys.',
  input: z.object({ record_id: z.string(), force: z.boolean().default(false) }),
  scopes: ['records:write'],
  async handler({ env, fetchImpl }, { record_id }) {
    const row = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ?', record_id);
    if (!row) throw new ToolError('record not found', 404);
    const ids = await all<{ provider: string; external_id: string }>(env.DB, 'SELECT provider, external_id FROM record_identities WHERE record_id = ?', record_id);
    const fm = json<Record<string, unknown>>(row.frontmatter_json, {});
    const tmdb = ids.find((i) => i.provider === 'tmdb');
    const ol = ids.find((i) => i.provider === 'openlibrary') ?? ids.find((i) => i.provider === 'isbn');
    const mb = ids.find((i) => i.provider === 'musicbrainz');
    const identity = tmdb ? { provider: 'tmdb' as const, external_id: tmdb.external_id, media_type: row.kind === 'tv' ? ('tv' as const) : ('movie' as const) }
      : ol ? { provider: ol.provider as 'openlibrary' | 'isbn', external_id: ol.external_id }
      : mb ? { provider: 'musicbrainz' as const, external_id: mb.external_id } : null;
    if (!identity) throw new ToolError('no provider identity for this record', 400);
    const e = await enrich(env, identity, fetchImpl);
    const sets = Object.entries(e.keys).map(([k, v]) => ({ at: [k], value: v }));
    if (e.artwork.poster) sets.push({ at: ['artwork', 'poster'], value: e.artwork.poster });
    if (e.artwork.logo) sets.push({ at: ['artwork', 'logo'], value: e.artwork.logo });
    if (e.artwork.cover) sets.push({ at: ['artwork', 'cover'], value: e.artwork.cover });
    const commit = await vaultCommit(env, { message: `agent: refresh ${row.title ?? row.path}`, ops: [{ op: 'setIn', path: `${row.path}.md`, sets }] });
    return { updated: commit.results[0]?.status, locked: (fm.locked as string[]) ?? [], sources: Object.keys(e.keys.sources ?? {}) };
  },
});

export const recordsLink = defineTool({
  name: 'records_link',
  description: 'Connect two records. mode=related writes related: on the source; mode=suggest leaves a private suggestion for the owner. Dismissed pairs are never re-suggested.',
  input: z.object({ from_id: z.string(), to_id: z.string(), kind: z.string().default('related'), note: z.string().optional(), mode: z.enum(['related', 'suggest']).default('suggest'), confidence: z.number().min(0).max(1).default(0.5) }),
  scopes: ['records:write'],
  async handler({ env }, { from_id, to_id, kind, note, mode, confidence }) {
    const from = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ?', from_id);
    const to = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ?', to_id);
    if (!from || !to) throw new ToolError('record not found', 404);
    if (await one(env.DB, 'SELECT 1 FROM dismissals WHERE from_id = ? AND to_id = ? AND kind = ?', from_id, to_id, kind)) return { status: 'dismissed_before' };
    if (mode === 'suggest') {
      const id = `sug_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await run(env.DB, 'INSERT INTO suggestions (id, from_id, to_id, kind, reason, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, from_id, to_id, kind, note ?? null, confidence, 'open', now());
      return { status: 'suggested', suggestion_id: id };
    }
    await vaultCommit(env, { message: `agent: link ${from.title ?? from.path} → ${to.title ?? to.path}`, ops: [{ op: 'mergeList', path: `${from.path}.md`, key: 'related', items: [{ to: formatWikilink(to.path), kind, ...(note ? { note } : {}) }], matchOn: ['to', 'kind'] }] });
    await run(env.DB, 'INSERT OR REPLACE INTO record_links (from_id, to_id, kind) VALUES (?, ?, ?)', from_id, to_id, kind);
    return { status: 'linked' };
  },
});

export { loadVaultConfig };

export const itemIdentify = defineTool({
  name: 'item_identify',
  description: 'Find an existing item at its provider by title (films/tv: TMDB, books: Open Library, albums: MusicBrainz), then store the identity and sourced facts. Ambiguous matches come back as candidates instead of guessing.',
  input: z.object({ record_id: z.string(), title: z.string().optional(), year: z.number().int().optional(), creator: z.string().optional(), choose: z.string().optional().describe('a candidate id from a previous call, to confirm it') }),
  scopes: ['records:write'],
  async handler({ env, fetchImpl }, { record_id, title, year, creator, choose }) {
    const row = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ?', record_id);
    if (!row) throw new ToolError('record not found', 404);
    const fm = json<Record<string, unknown>>(row.frontmatter_json, {});
    const kind = row.kind ?? '';
    const q = { title: title ?? String(fm.title ?? row.title ?? ''), year: year ?? (typeof fm.year === 'number' ? fm.year : undefined), creator: creator ?? (Array.isArray(fm.authors) ? String(fm.authors[0]) : typeof fm.artist === 'string' ? fm.artist : undefined) };
    let identity: Identity | null = null;
    let candidates: Array<{ id: string; title: string; year?: number; creator?: string }> = [];
    if (choose) {
      identity = kind === 'book' ? { provider: 'openlibrary', external_id: choose } : kind === 'album' ? { provider: 'musicbrainz', external_id: choose } : { provider: 'tmdb', external_id: choose, media_type: kind === 'tv' ? 'tv' : 'movie' };
    } else if (kind === 'book') {
      const ol = new OpenLibrary(fetchImpl, env.OPENLIBRARY_BASE_URL || undefined);
      const hits = await ol.search(q.title, { author: q.creator });
      const m = judge(q, hits.map((h) => ({ id: h.olid, title: h.title, year: h.year, popularity: h.popularity, extra: { creator: h.authors.join(', ') } })));
      if (m.match === 'confident') identity = { provider: 'openlibrary', external_id: m.candidate.id };
      else if (m.match === 'ambiguous') candidates = m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, creator: String(c.extra?.creator ?? '') }));
    } else if (kind === 'album') {
      const mb = new MusicBrainz(fetchImpl, env.MUSICBRAINZ_BASE_URL || undefined);
      const hits = await mb.search(q.title, q.creator);
      const m = judge(q, hits.map((h) => ({ id: h.rgid, title: h.title, year: h.year, popularity: h.score, extra: { creator: h.artist } })));
      if (m.match === 'confident') identity = { provider: 'musicbrainz', external_id: m.candidate.id };
      else if (m.match === 'ambiguous') candidates = m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, creator: String(c.extra?.creator ?? '') }));
    } else if (kind === 'film' || kind === 'tv') {
      if (!env.TMDB_TOKEN) throw new ToolError('TMDB_TOKEN is not set', 500);
      const tmdb = new Tmdb(env.TMDB_TOKEN, fetchImpl, env.TMDB_BASE_URL || undefined, env.TMDB_IMAGE_URL || undefined);
      const hits = await tmdb.search(q.title, { kind: kind === 'tv' ? 'tv' : 'movie', year: q.year });
      const m = judge(q, hits.map((h) => ({ id: String(h.id), title: h.title, year: h.year, popularity: h.popularity })));
      if (m.match === 'confident') identity = { provider: 'tmdb', external_id: m.candidate.id, media_type: kind === 'tv' ? 'tv' : 'movie' };
      else if (m.match === 'ambiguous') candidates = m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year }));
    } else throw new ToolError(`no provider for kind ${kind}`, 400);
    if (!identity) return { status: candidates.length ? 'ambiguous' : 'none', candidates };
    const e = await enrich(env, identity, fetchImpl);
    const sets = Object.entries(e.keys).map(([k, v]) => ({ at: [k], value: v }));
    if (e.year && !fm.year) sets.push({ at: ['year'], value: e.year });
    for (const idn of e.identities) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', idn.provider, idn.external_id, row.id);
    const commit = await vaultCommit(env, { message: `agent: identify ${row.title ?? row.path}`, ops: [{ op: 'setIn', path: `${row.path}.md`, sets }] });
    if (e.artwork.cover || e.artwork.poster || e.artwork.logo) await enqueue(env, 'derive_media', row.id, `media:${row.id}:${Date.now()}`, { record_path: `${row.path}.md`, poster: e.artwork.poster, logo: e.artwork.logo, cover: e.artwork.cover });
    return { status: 'identified', identity, updated: commit.results[0]?.status, facts: Object.keys(e.keys), artwork: e.artwork };
  },
});

export const recordsReindex = defineTool({
  name: 'records_reindex',
  description: 'Rebuild the records index from every file in the vault (after a bulk import or when something looks missing).',
  input: z.object({}),
  scopes: ['records:write'],
  async handler({ env }) {
    return reindexAll(env);
  },
});

export const entryComplete = defineTool({
  name: 'entry_complete',
  description: 'Finish a list entry: it moves to the list type\'s done list (Watched, Read, Listened), the item is stamped finished, and a review draft is created when asked.',
  input: z.object({ entry_id: z.string(), finished: z.string().optional().describe('YYYY-MM-DD, default today'), review: z.boolean().default(false) }),
  scopes: ['records:write'],
  async handler({ env }, { entry_id, finished, review }) {
    const row = await one<RecordRow>(env.DB, "SELECT * FROM records WHERE id = ? AND type = 'list-entry'", entry_id);
    if (!row) throw new ToolError('entry not found', 404);
    return completeEntry(env, undefined, row as never, { finished, review });
  },
});
