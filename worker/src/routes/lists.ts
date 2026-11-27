// Lists for the owner's eyes: a list with its entries and their items regardless of visibility, so a private
// list is still a page you can open and work on; and an item's memberships, private ones included.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { one, all, type RecordRow } from '../db';
import { normalizeTarget } from '@lem/vault-core';

export const lists = new Hono<AppEnv>();

const KIND_ROUTES: Record<string, string> = { film: 'film', tv: 'tv', book: 'books', album: 'albums', product: 'things', place: 'places', link: 'links', photo: 'photos' };
const refPath = (v: unknown) => normalizeTarget(String(v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim());
const fm = (r: RecordRow | null | undefined) => (r ? (JSON.parse(r.frontmatter_json ?? '{}') as Record<string, unknown>) : {});

function slimItem(r: RecordRow) {
  const d = fm(r);
  const art = (d.artwork ?? {}) as Record<string, unknown>;
  return { id: r.id, path: r.path, title: r.title, kind: r.kind, year: d.year ?? null, visibility: r.visibility, finished: d.finished ?? null, url: `/${KIND_ROUTES[r.kind ?? ''] ?? r.kind}/${r.path.split('/').pop()}/`, artwork: { thumb: art.thumb ?? null, thumb_size: art.thumb_size ?? null, clip: art.clip ?? null, clip_size: art.clip_size ?? null, full: art.full ?? null, treatment: art.treatment ?? null } };
}

lists.get('/api/lists/:ref', requireOwner, async (c) => {
  const ref = c.req.param('ref');
  const row = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'list' AND (id = ? OR path = ? OR path = ?)", ref, normalizeTarget(ref), `lists/${ref}`);
  if (!row) return c.json({ error: 'list not found' }, 404);
  const stem = row.path.split('/').pop()!;
  const d = fm(row);
  const entries = await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'list-entry' AND (path LIKE ? OR json_extract(frontmatter_json, '$.list') LIKE ?)", `lists/${stem}/%`, `%[[${row.path}]]%`);
  const itemPaths = [...new Set(entries.map((e) => refPath(fm(e).item)))];
  const items = itemPaths.length ? await all<RecordRow>(c.env.DB, `SELECT * FROM records WHERE path IN (${itemPaths.map(() => '?').join(',')})`, ...itemPaths) : [];
  const byPath = new Map(items.map((i) => [i.path, i]));
  const all1 = c.req.query('all') === '1';
  const out = entries.map((e) => { const ef = fm(e); const it = byPath.get(refPath(ef.item)); return { id: e.id, path: e.path, state: (ef.state as string) ?? 'active', added: ef.added ?? null, finished: ef.finished ?? null, from: ef.from ? refPath(ef.from).split('/').pop() : null, visibility: e.visibility, why: e.body_excerpt ?? '', item: it ? slimItem(it) : { id: null, path: refPath(ef.item), title: refPath(ef.item).split('/').pop(), kind: null, missing: true } }; })
    .filter((e) => all1 || e.state !== 'removed')
    .sort((a, b) => String(b.finished ?? b.added ?? '').localeCompare(String(a.finished ?? a.added ?? '')));
  const counts = { active: out.filter((e) => e.state === 'active').length, done: out.filter((e) => e.state === 'done').length, removed: entries.length - out.filter((e) => e.state !== 'removed').length, private_entries: entries.filter((e) => e.visibility === 'private').length, private_items: items.filter((i) => i.visibility === 'private').length };
  return c.json({ list: { id: row.id, path: row.path, title: row.title, list_type: d.list_type ?? null, visibility: row.visibility, sort: d.sort ?? 'added-desc', form: d.form ?? null, summary: d.summary ?? null, body: row.body_excerpt ?? '' }, entries: out, counts });
});

lists.get('/api/items/:id/lists', requireOwner, async (c) => {
  const item = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'item' AND (id = ? OR path = ?)", c.req.param('id'), normalizeTarget(c.req.param('id')));
  if (!item) return c.json({ error: 'item not found' }, 404);
  const stem = item.path.split('/').pop()!;
  const entries = await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'list-entry' AND (json_extract(frontmatter_json, '$.item') LIKE ? OR json_extract(frontmatter_json, '$.item') LIKE ?)", `%[[${item.path}]]%`, `%[[${stem}]]%`);
  const listPaths = [...new Set(entries.map((e) => refPath(fm(e).list)))];
  const ls = listPaths.length ? await all<RecordRow>(c.env.DB, `SELECT * FROM records WHERE path IN (${listPaths.map(() => '?').join(',')})`, ...listPaths) : [];
  const byPath = new Map(ls.map((l) => [l.path, l]));
  return c.json({ lists: entries.map((e) => { const ef = fm(e); const l = byPath.get(refPath(ef.list)); return { entry: { id: e.id, path: e.path, state: ef.state ?? 'active', added: ef.added ?? null, finished: ef.finished ?? null, visibility: e.visibility }, list: l ? { id: l.id, path: l.path, title: l.title, visibility: l.visibility, list_type: fm(l).list_type ?? null } : { path: refPath(ef.list), missing: true } }; }) });
});
