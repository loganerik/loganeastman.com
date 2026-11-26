// The one write tool: turn a capture plus a decision into vault records, idempotently.
import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { itemKind, newId, itemSlug, slugify, serializeNote, itemPath, listEntryPath, listPath, feedPath, reviewPath, writingPath, datedSlug, formatWikilink, normalizeTarget } from '@lem/vault-core';
import { one, all, run, now, json } from '../db';
import type { CaptureRow } from '../routes/captures';
import { enrich, type Enriched } from '../processor/enrich';
import { vaultCommit } from '../do/VaultWriter';
import type { VaultOp } from '../vault/ops';
import { loadVaultConfig } from '../vault/config';
import { enqueue } from '../processor/jobs';

export const decisionSchema = z.object({
  kind: z.enum([...itemKind.options, 'none']),
  identity: z.union([
    z.object({ provider: z.literal('tmdb'), external_id: z.string(), media_type: z.enum(['movie', 'tv']) }),
    z.object({ provider: z.literal('openlibrary'), external_id: z.string() }),
    z.object({ provider: z.literal('isbn'), external_id: z.string() }),
    z.object({ provider: z.literal('musicbrainz'), external_id: z.string() }),
  ]).optional(),
  og_image: z.string().optional(),
  site_name: z.string().optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  year: z.number().int().optional(),
  url: z.string().optional(),
  file_as: z.array(z.object({ target: z.enum(['list', 'feed', 'review', 'writing']), list: z.string().optional(), collection: z.string().optional() })).min(1),
  visibility: z.enum(['public', 'private']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  connections: z.array(z.object({ to: z.string(), kind: z.string().default('related'), reason: z.string().optional(), confidence: z.number().min(0).max(1).default(0.5) })).default([]),
});
export type OrganizeDecision = z.infer<typeof decisionSchema>;

export interface OrganizeResult {
  item?: { id: string; path: string; created: boolean; url?: string };
  records: Array<{ id: string; path: string; type: string; created: boolean }>;
  commit_oid: string | null;
  suggestions: string[];
}

interface RecordRow { id: string; path: string; type: string; kind: string | null; title: string | null; visibility: string | null; frontmatter_json: string | null }

export const captureOrganize = defineTool<{ capture_id: string; decision: OrganizeDecision }, OrganizeResult>({
  name: 'capture_organize',
  description: 'File a capture: reuse or create the item it refers to (enriched from its provider), add it to a list / the feed / a review draft, and commit to the vault. Idempotent per capture.',
  input: z.object({ capture_id: z.string(), decision: decisionSchema }),
  scopes: ['inbox:write', 'records:write'],
  async handler(ctx, { capture_id, decision }) {
    const { env } = ctx;
    const capture = await one<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE id = ?', capture_id);
    if (!capture) throw new ToolError('capture not found', 404);
    if (capture.status === 'done' && capture.result_json) return json<OrganizeResult>(capture.result_json, { records: [], commit_oid: null, suggestions: [] });
    const cfg = await loadVaultConfig(env);
    const visibility = decision.visibility ?? (capture.visibility as 'public' | 'private');
    const t = now();
    const day = t.slice(0, 10);
    const ops: VaultOp[] = [];
    const result: OrganizeResult = { records: [], commit_oid: null, suggestions: [] };
    const why = capture.why.trim();
    const privTags = json<string[]>(capture.tags_json ?? null, []).map((t) => `private/${slugify(t)}`);
    const people = json<string[]>(capture.people_json ?? null, []);
    const peopleRefs: Array<{ to: string; kind: string }> = [];
    for (const name of people) {
      const slug = slugify(name);
      if (!slug) continue;
      const path = `people/${slug}`;
      if (!(await one(env.DB, 'SELECT 1 FROM records WHERE path = ?', path))) {
        const pid = newId('person');
        ops.push({ op: 'create', path: `${path}.md`, contents: serializeNote({ id: pid, type: 'person', name, visibility: 'private', created: t }, ''), ifAbsent: true });
        await run(env.DB, 'INSERT OR IGNORE INTO records (id, path, type, kind, title, visibility, frontmatter_json, indexed_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)', pid, path, 'person', name, 'private', JSON.stringify({ name }), t);
      }
      peopleRefs.push({ to: formatWikilink(path), kind: 'mention' });
    }

    // ---- the item (reuse by identity, else create + enrich) ----
    let itemRef: { id: string; path: string; title: string; kind: string } | null = null;
    let enriched: Enriched | null = null;
    if (decision.kind !== 'none') {
      let existing: RecordRow | null = null;
      if (decision.identity) existing = await one<RecordRow>(env.DB, 'SELECT r.* FROM record_identities i JOIN records r ON r.id = i.record_id WHERE i.provider = ? AND i.external_id = ?', decision.identity.provider, decision.identity.external_id);
      if (!existing && decision.url && (decision.kind === 'link' || decision.kind === 'product' || decision.kind === 'place')) existing = await one<RecordRow>(env.DB, "SELECT * FROM records WHERE type = 'item' AND json_extract(frontmatter_json, '$.url') = ?", decision.url);
      if (existing) {
        itemRef = { id: existing.id, path: existing.path, title: existing.title ?? decision.title ?? '', kind: existing.kind ?? decision.kind };
        result.item = { id: existing.id, path: existing.path, created: false };
      } else {
        if (decision.identity) enriched = await enrich(env, decision.identity, ctx.fetchImpl);
        const kind = enriched?.kind ?? decision.kind;
        const title = enriched?.title ?? decision.title;
        if (!title) throw new ToolError('cannot create an item without a title');
        const year = enriched?.year ?? decision.year;
        const slug = itemSlug(title, year);
        const file = itemPath(kind, slug);
        const path = normalizeTarget(file);
        const id = newId(kind);
        const fm: Record<string, unknown> = {
          id, type: 'item', kind, title, year, visibility,
          ...(decision.url && !enriched ? { url: decision.url, site_name: decision.site_name, og_title: decision.title, og_description: decision.description } : {}),
          ...(enriched?.keys ?? {}),
          artwork: { ...(enriched?.artwork.poster ? { poster: enriched.artwork.poster } : {}), ...(enriched?.artwork.logo ? { logo: enriched.artwork.logo } : {}), ...(enriched?.artwork.cover ? { cover: enriched.artwork.cover } : {}), ...(!enriched && decision.og_image ? { og: decision.og_image } : {}) },
          tags: privTags, related: peopleRefs, locked: [], created: t,
        };
        ops.push({ op: 'create', path: file, contents: serializeNote(fm, ''), ifAbsent: true });
        itemRef = { id, path, title, kind };
        result.item = { id, path, created: true };
      }
    }

    // ---- filing ----
    for (const f of decision.file_as) {
      if (f.target === 'list') {
        if (!itemRef) throw new ToolError('cannot add to a list without an item');
        const listKey = f.list ?? cfg.listTypes.find((lt) => lt.default_for.includes(itemRef!.kind as never))?.key;
        if (!listKey) throw new ToolError('no list given and no default list for this kind');
        const lt = cfg.listTypes.find((x) => x.key === listKey);
        const listFile = listPath(listKey);
        const listRow = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', normalizeTarget(listFile));
        if (!listRow) {
          // first use of a configured list type: create the list note itself
          if (!lt) throw new ToolError(`unknown list: ${listKey}`);
          ops.push({ op: 'create', path: listFile, contents: serializeNote({ id: newId('list'), type: 'list', list_type: lt.key, title: lt.title, visibility: lt.private_default ? 'private' : 'public', sort: 'added-desc', created: t }, ''), ifAbsent: true });
        }
        const entryPath = listEntryPath(listKey, itemRef.path.split('/').pop()!);
        const entryId = newId('entry');
        ops.push({ op: 'create', path: entryPath, contents: serializeNote({ id: entryId, type: 'list-entry', list: formatWikilink(normalizeTarget(listFile)), item: formatWikilink(itemRef.path), added: day, state: 'active', visibility: lt?.private_default ? 'private' : visibility, capture: capture.id, tags: privTags, related: peopleRefs }, why), ifAbsent: true });
        result.records.push({ id: entryId, path: entryPath, type: 'list-entry', created: true });
      } else if (f.target === 'feed') {
        const id = newId('feed');
        const path = feedPath(day, id);
        const body = why || capture.text || (capture.url ? capture.url : '');
        const fm: Record<string, unknown> = { id, type: 'feed', date: t, visibility, tags: privTags, related: peopleRefs };
        if (itemRef) fm.about = formatWikilink(itemRef.path);
        else if (capture.url) fm.link = capture.url;
        ops.push({ op: 'create', path, contents: serializeNote(fm, itemRef ? body : capture.url && body !== capture.url ? `${body}\n\n${capture.url}` : body), ifAbsent: true });
        result.records.push({ id, path, type: 'feed', created: true });
      } else if (f.target === 'review') {
        if (!itemRef) throw new ToolError('a review needs an item');
        const id = newId('review');
        const path = reviewPath(day, itemRef.path.split('/').pop()!);
        ops.push({ op: 'create', path, contents: serializeNote({ id, type: 'review', item: formatWikilink(itemRef.path), date: day, visibility, draft: true }, why), ifAbsent: true });
        result.records.push({ id, path, type: 'review', created: true });
      } else if (f.target === 'writing') {
        const coll = cfg.collections.find((c) => c.key === (f.collection ?? cfg.collections[0]?.key));
        if (!coll) throw new ToolError('no writing collection configured');
        const id = newId('post');
        const title = decision.title ?? capture.title ?? why.slice(0, 60) ?? 'Untitled';
        const path = writingPath(coll.path ?? `writing/${coll.key}`, day, datedSlug(day, title).replace(/^\d{4}-\d{2}-\d{2}-/, ''));
        ops.push({ op: 'create', path, contents: serializeNote({ id, type: 'writing', collection: coll.key, title, date: day, visibility, draft: true, capture: capture.id }, why ? `${why}\n` : ''), ifAbsent: true });
        result.records.push({ id, path, type: 'writing', created: true });
      }
    }

    // ---- connections: confident ones become related:, the rest private suggestions (dismissals respected) ----
    if (itemRef && decision.connections.length) {
      const related: Array<{ to: string; kind: string; note?: string }> = [];
      for (const c of decision.connections) {
        const target = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE id = ? OR path = ?', c.to, normalizeTarget(c.to));
        if (!target) continue;
        const dismissed = await one(env.DB, 'SELECT 1 FROM dismissals WHERE from_id = ? AND to_id = ? AND kind = ?', itemRef.id, target.id, c.kind);
        if (dismissed) continue;
        if (c.confidence >= cfg.site.connection_auto_threshold) related.push({ to: formatWikilink(target.path), kind: c.kind, note: c.reason });
        else {
          const sid = newId('sug');
          await run(env.DB, 'INSERT INTO suggestions (id, from_id, to_id, kind, reason, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', sid, itemRef.id, target.id, c.kind, c.reason ?? null, c.confidence, 'open', t);
          result.suggestions.push(sid);
        }
      }
      if (related.length && !result.item?.created) ops.push({ op: 'setKeys', path: `${itemRef.path}.md`, keys: { related } }); // TODO merge instead of replace
    }

    // ---- commit, once ----
    const jobRow = await one<{ id: string }>(env.DB, "SELECT id FROM jobs WHERE idempotency_key = ?", `organize:${capture.id}`);
    const headline = itemRef ? `agent: ${result.item?.created ? 'add' : 'file'} ${itemRef.title}${decision.file_as.some((f) => f.target === 'list') ? ' → ' + (decision.file_as.find((f) => f.target === 'list')?.list ?? 'list') : ''}` : `agent: ${decision.file_as.map((f) => f.target).join(', ')} from capture`;
    const commit = await vaultCommit(env, { message: headline, ops, jobId: jobRow?.id, captureId: capture.id });
    result.commit_oid = commit.oid;
    for (const r of commit.results) {
      const rec = result.records.find((x) => x.path === r.path);
      if (rec && r.status === 'skipped') rec.created = false;
      if (result.item && normalizeTarget(r.path) === result.item.path && r.status === 'skipped') result.item.created = false;
    }

    // ---- optimistic index + identities (the push webhook confirms) ----
    if (itemRef && result.item?.created) {
      await run(env.DB, 'INSERT OR REPLACE INTO records (id, path, type, kind, title, visibility, frontmatter_json, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', itemRef.id, itemRef.path, 'item', itemRef.kind, itemRef.title, visibility, JSON.stringify({ title: itemRef.title, kind: itemRef.kind, url: decision.url }), t);
      for (const idn of enriched?.identities ?? (decision.identity ? [decision.identity] : [])) await run(env.DB, 'INSERT OR REPLACE INTO record_identities (provider, external_id, record_id) VALUES (?, ?, ?)', idn.provider, idn.external_id, itemRef.id);
      if (enriched?.artwork.poster || enriched?.artwork.logo || enriched?.artwork.cover) await enqueue(env, 'derive_media', itemRef.id, `media:${itemRef.id}`, { record_path: `${itemRef.path}.md`, poster: enriched.artwork.poster, logo: enriched.artwork.logo, cover: enriched.artwork.cover });
      else if (!enriched && decision.og_image) await enqueue(env, 'derive_media', itemRef.id, `media:${itemRef.id}`, { record_path: `${itemRef.path}.md`, og: `url:${decision.og_image}` });
    }
    for (const r of result.records) if (r.created) await run(env.DB, 'INSERT OR REPLACE INTO records (id, path, type, kind, title, visibility, frontmatter_json, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', r.id, normalizeTarget(r.path), r.type, null, itemRef?.title ?? null, visibility, '{}', t);
    if (result.item) result.item.url = `${env.SITE_URL}/${kindRoute(itemRef!.kind)}/${itemRef!.path.split('/').pop()!}/`;
    await run(env.DB, "UPDATE captures SET status = 'done', result_json = ?, error = NULL, updated_at = ? WHERE id = ?", JSON.stringify(result), now(), capture.id);
    return result;
  },
});

// mirrors theme/identity kinds routes; kept here so the worker can hand back a URL without importing the site
function kindRoute(kind: string): string {
  return ({ film: 'film', tv: 'tv', book: 'books', album: 'albums', product: 'things', place: 'places', link: 'links', photo: 'photos' } as Record<string, string>)[kind] ?? kind;
}

export { all };
