// Finishing something: a list entry moves to the list type's "done" list (Watched, Read, Listened), the item is
// stamped `finished`, and, if asked, a review draft opens. One vault commit, idempotent, owner only.
import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { requireOwner } from '../auth/access';
import { one, all, run, now, type RecordRow } from '../db';
import { vaultFor } from '../vault/github';
import { vaultCommit } from '../do/VaultWriter';
import type { VaultOp } from '../vault/ops';
import { loadVaultConfig } from '../vault/config';
import { parseNote, serializeNote, newId, normalizeTarget, reviewPath, formatWikilink } from '@lem/vault-core';
import { afterWrite, afterDelete } from './publish';

export const complete = new Hono<AppEnv>();

interface Outcome { ok: true; already?: boolean; entry?: { id: string; path: string; list: string }; moved: boolean; done_list?: { path: string; created: boolean }; item?: { id: string; finished: string }; review?: { id: string; path: string; created: boolean }; commit?: string | null }

async function completeEntry(env: Env, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, entryRow: RecordRow, opts: { finished?: string; review?: boolean }): Promise<Outcome> {
  const cfg = await loadVaultConfig(env);
  const gh = vaultFor(env);
  const blob = await gh.readFile(`${entryRow.path}.md`);
  if (!blob) throw new Error('entry file missing');
  const note = parseNote(blob.text);
  const efm = note.frontmatter as Record<string, unknown>;
  const listPathNoExt = normalizeTarget(String(efm.list ?? ''));
  const itemPathNoExt = normalizeTarget(String(efm.item ?? ''));
  const listRow = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', listPathNoExt);
  const itemRow = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', itemPathNoExt);
  const listFm = JSON.parse(listRow?.frontmatter_json ?? '{}') as { list_type?: string };
  const lt = cfg.listTypes.find((t) => t.key === listFm.list_type);
  const day = (opts.finished ?? now()).slice(0, 10);
  const t = now();
  const itemStem = itemPathNoExt.split('/').pop()!;
  const listStem = listPathNoExt.split('/').pop()!;
  const ops: VaultOp[] = [];
  const touched: Array<{ path: string; before: RecordRow | null }> = [];
  let moved = false;
  let doneList: Outcome['done_list'];
  let entryOut: Outcome['entry'] = { id: entryRow.id, path: entryRow.path, list: listPathNoExt };
  if (efm.state === 'done' && !lt?.completion) return { ok: true, already: true, entry: entryOut, moved: false };
  if (lt?.completion) {
    const doneKey = lt.completion.list;
    const doneType = cfg.listTypes.find((x) => x.key === doneKey);
    const doneListPath = `lists/${doneKey}`;
    const doneRow = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', doneListPath);
    if (!doneRow) {
      ops.push({ op: 'create', path: `${doneListPath}.md`, ifAbsent: true, contents: serializeNote({ id: newId('list'), type: 'list', list_type: doneKey, title: doneType?.title ?? doneKey, visibility: doneType?.private_default ? 'private' : 'public', sort: 'finished-desc', created: t }, '') });
      touched.push({ path: `${doneListPath}.md`, before: null });
    }
    doneList = { path: doneListPath, created: !doneRow };
    if (listPathNoExt === doneListPath) return { ok: true, already: true, entry: entryOut, moved: false, done_list: doneList };
    const targetPath = `${doneListPath}/${itemStem}`;
    const targetRow = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', targetPath);
    if (!targetRow) {
      const { capture, ...rest } = efm;
      void capture;
      ops.push({ op: 'create', path: `${targetPath}.md`, ifAbsent: true, contents: serializeNote({ ...rest, id: entryRow.id, list: formatWikilink(doneListPath), state: 'active', finished: day, from: formatWikilink(listPathNoExt), updated: t }, note.body) });
    } else {
      ops.push({ op: 'setKeys', path: `${targetPath}.md`, keys: { finished: day, updated: t } });
    }
    touched.push({ path: `${targetPath}.md`, before: targetRow });
    ops.push({ op: 'delete', path: `${entryRow.path}.md` });
    moved = true;
    entryOut = { id: entryRow.id, path: targetPath, list: doneListPath };
  } else {
    ops.push({ op: 'setKeys', path: `${entryRow.path}.md`, keys: { state: 'done', finished: day, updated: t } });
    touched.push({ path: `${entryRow.path}.md`, before: entryRow });
  }
  let itemOut: Outcome['item'];
  if (itemRow) {
    ops.push({ op: 'setKeys', path: `${itemRow.path}.md`, keys: { finished: day } });
    touched.push({ path: `${itemRow.path}.md`, before: itemRow });
    itemOut = { id: itemRow.id, finished: day };
  }
  let reviewOut: Outcome['review'];
  if (opts.review && itemRow) {
    const rp = reviewPath(day, itemStem);
    const existing = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', rp.replace(/\.md$/, ''));
    if (!existing) {
      const rid = newId('review');
      ops.push({ op: 'create', path: rp, ifAbsent: true, contents: serializeNote({ id: rid, type: 'review', item: formatWikilink(itemRow.path), date: day, draft: true, visibility: 'public', created: t }, '') });
      touched.push({ path: rp, before: null });
      reviewOut = { id: rid, path: rp.replace(/\.md$/, ''), created: true };
    } else reviewOut = { id: existing.id, path: existing.path, created: false };
  }
  const itemTitle = itemRow?.title ?? itemStem;
  const commit = await vaultCommit(env, { message: `done: ${itemTitle}${lt?.completion ? ` → ${cfg.listTypes.find((x) => x.key === lt.completion!.list)?.title ?? lt.completion.list}` : ''}`, ops });
  // the moved entry keeps its id: drop the old row before the new path is indexed
  if (moved) { await run(env.DB, 'DELETE FROM records WHERE id = ?', entryRow.id); await afterDelete(env, ctx, [entryRow]); }
  for (const w of touched) {
    const fresh = await gh.readFile(w.path);
    if (fresh) await afterWrite(env, ctx, { before: w.before, path: w.path, text: fresh.text, sha: fresh.sha });
  }
  return { ok: true, entry: entryOut, moved, done_list: doneList, item: itemOut, review: reviewOut, commit: commit.oid };
}

complete.post('/api/entries/:id/complete', requireOwner, async (c) => {
  const row = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE id = ? AND type = 'list-entry'", c.req.param('id'));
  if (!row) return c.json({ error: 'entry not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { finished?: string; review?: boolean };
  return c.json(await completeEntry(c.env, c.executionCtx, row, body));
});

/** Finish an item wherever it sits: every active entry on a list whose type completes; or straight onto the done list. */
complete.post('/api/items/:id/complete', requireOwner, async (c) => {
  const item = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE id = ? AND type = 'item'", c.req.param('id'));
  if (!item) return c.json({ error: 'item not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { finished?: string; review?: boolean };
  const cfg = await loadVaultConfig(c.env);
  const stem = item.path.split('/').pop()!;
  const entries = await all<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'list-entry' AND (json_extract(frontmatter_json, '$.item') LIKE ? OR json_extract(frontmatter_json, '$.item') LIKE ?) AND COALESCE(json_extract(frontmatter_json, '$.state'), 'active') = 'active'", `%[[${item.path}]]%`, `%[[${stem}]]%`);
  const results: Outcome[] = [];
  for (const e of entries) {
    const listPath = normalizeTarget(String((JSON.parse(e.frontmatter_json ?? '{}') as { list?: string }).list ?? ''));
    const listRow = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE path = ?', listPath);
    const lt = cfg.listTypes.find((t) => t.key === (JSON.parse(listRow?.frontmatter_json ?? '{}') as { list_type?: string }).list_type);
    if (lt?.completion) results.push(await completeEntry(c.env, c.executionCtx, e, { ...body, review: body.review && results.length === 0 }));
  }
  if (results.length) return c.json({ ok: true, entries: results });
  // not on any list that completes: put it straight on the done list for its kind
  const lt = cfg.listTypes.find((t) => t.completion && t.default_for.includes(item.kind as never));
  if (!lt?.completion) return c.json({ error: `no list type finishes a ${item.kind}` }, 400);
  const day = (body.finished ?? now()).slice(0, 10);
  const t = now();
  const doneKey = lt.completion.list;
  const doneType = cfg.listTypes.find((x) => x.key === doneKey);
  const doneListPath = `lists/${doneKey}`;
  const doneRow = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE path = ?', doneListPath);
  const entryPath = `${doneListPath}/${stem}`;
  const existing = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE path = ?', entryPath);
  const ops: VaultOp[] = [];
  if (!doneRow) ops.push({ op: 'create', path: `${doneListPath}.md`, ifAbsent: true, contents: serializeNote({ id: newId('list'), type: 'list', list_type: doneKey, title: doneType?.title ?? doneKey, visibility: doneType?.private_default ? 'private' : 'public', sort: 'finished-desc', created: t }, '') });
  const entryId = existing?.id ?? newId('entry');
  if (!existing) ops.push({ op: 'create', path: `${entryPath}.md`, ifAbsent: true, contents: serializeNote({ id: entryId, type: 'list-entry', list: formatWikilink(doneListPath), item: formatWikilink(item.path), added: day, finished: day, state: 'active', visibility: 'public', created: t }, '') });
  else ops.push({ op: 'setKeys', path: `${entryPath}.md`, keys: { finished: day, updated: t } });
  ops.push({ op: 'setKeys', path: `${item.path}.md`, keys: { finished: day } });
  let reviewOut: Outcome['review'];
  if (body.review) {
    const rp = reviewPath(day, stem);
    const er = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE path = ?', rp.replace(/\.md$/, ''));
    if (!er) { const rid = newId('review'); ops.push({ op: 'create', path: rp, ifAbsent: true, contents: serializeNote({ id: rid, type: 'review', item: formatWikilink(item.path), date: day, draft: true, visibility: 'public', created: t }, '') }); reviewOut = { id: rid, path: rp.replace(/\.md$/, ''), created: true }; }
    else reviewOut = { id: er.id, path: er.path, created: false };
  }
  const commit = await vaultCommit(c.env, { message: `done: ${item.title ?? stem} → ${doneType?.title ?? doneKey}`, ops });
  const gh = vaultFor(c.env);
  for (const [p, before] of [[`${doneListPath}.md`, doneRow], [`${entryPath}.md`, existing], [`${item.path}.md`, item], ...(reviewOut ? [[`${reviewOut.path}.md`, null]] : [])] as Array<[string, RecordRow | null]>) {
    const fresh = await gh.readFile(p);
    if (fresh) await afterWrite(c.env, c.executionCtx, { before, path: p, text: fresh.text, sha: fresh.sha });
  }
  return c.json({ ok: true, entries: [{ ok: true, entry: { id: entryId, path: entryPath, list: doneListPath }, moved: false, done_list: { path: doneListPath, created: !doneRow }, item: { id: item.id, finished: day }, review: reviewOut, commit: commit.oid }] });
});
