// A link attached to a thought (like a link in a tweet): turn a URL into a link item, or reuse the one that has it.
// The page's facts fill the item; its picture is fetched and cut out in the background like any capture.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { one, now, type RecordRow } from '../db';
import { afterWrite } from './publish';
import { vaultFor } from '../vault/github';
import { vaultCommit } from '../do/VaultWriter';
import { enqueue } from '../processor/jobs';
import { fetchPageFacts } from '@lem/providers';
import { serializeNote, newId, itemSlug, itemPath, normalizeTarget } from '@lem/vault-core';

export const links = new Hono<AppEnv>();

links.post('/api/links', requireOwner, async (c) => {
  const { url: raw } = (await c.req.json().catch(() => ({}))) as { url?: string };
  let url: string;
  try { url = new URL(String(raw ?? '').trim()).toString(); } catch { return c.json({ error: 'not a link' }, 400); }
  if (!/^https?:/.test(url)) return c.json({ error: 'not a web link' }, 400);
  const existing = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'item' AND json_extract(frontmatter_json, '$.url') = ?", url);
  if (existing) return c.json({ id: existing.id, path: existing.path, title: existing.title, kind: existing.kind, created: false });

  const facts = await fetchPageFacts(url, undefined, { via: c.env.PAGE_PROXY_URL || undefined }).catch(() => null);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const title = (facts?.title ?? facts?.html_title ?? '').trim() || host;
  const t = now();
  const id = newId('link');
  const file = itemPath('link', itemSlug(title));
  const fm: Record<string, unknown> = {
    id, type: 'item', kind: 'link', title, visibility: 'public', url,
    site_name: facts?.site_name ?? host,
    ...(facts?.title ? { og_title: facts.title } : {}),
    ...(facts?.description ? { og_description: facts.description } : {}),
    ...(facts?.image ? { artwork: { og: facts.image } } : {}),
    tags: [], related: [], locked: [], created: t,
  };
  const commit = await vaultCommit(c.env, { message: `link: ${title}`, ops: [{ op: 'create', path: file, contents: serializeNote(fm, ''), ifAbsent: true }] });
  if (commit.results[0]?.status === 'skipped') return c.json({ error: `a file already exists at ${file}` }, 409);
  const fresh = await vaultFor(c.env).readFile(file);
  if (fresh) await afterWrite(c.env, c.executionCtx, { before: null, path: file, text: fresh.text, sha: fresh.sha });
  // the picture: the page's own image, else whatever can be found; cut out like a capture
  await enqueue(c.env, 'derive_media', id, `media:${id}:link`, { record_path: file, og: facts?.image ? `url:${facts.image}` : `find:${url}` });
  return c.json({ id, path: normalizeTarget(file), title, kind: 'link', created: true }, 201);
});
