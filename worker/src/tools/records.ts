import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { one, all, run, now, json } from '../db';
import { vaultFor } from '../vault/github';
import { parseNote, formatWikilink, normalizeTarget } from '@lem/vault-core';
import { vaultCommit } from '../do/VaultWriter';
import { enrich } from '../processor/enrich';
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
    if (q) { where.push('(title LIKE ? OR path LIKE ? OR body_excerpt LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
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
    const blob = await vaultFor(env).readFile(`${from.path}.md`);
    const related = ((parseNote(blob?.text ?? '').frontmatter.related as Array<Record<string, unknown>>) ?? []).filter((r) => normalizeTarget(String(r.to).replace(/^\[\[|\]\]$/g, '')) !== to.path);
    related.push({ to: formatWikilink(to.path), kind, ...(note ? { note } : {}) });
    await vaultCommit(env, { message: `agent: link ${from.title ?? from.path} → ${to.title ?? to.path}`, ops: [{ op: 'setKeys', path: `${from.path}.md`, keys: { related } }] });
    await run(env.DB, 'INSERT OR REPLACE INTO record_links (from_id, to_id, kind) VALUES (?, ?, ?)', from_id, to_id, kind);
    return { status: 'linked' };
  },
});

export { loadVaultConfig };
