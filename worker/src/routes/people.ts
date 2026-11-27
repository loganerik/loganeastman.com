// People and tags as things the owner can make and look up by name. Both are idempotent: asking for a person
// who already exists returns them. People start private; tags start public.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { one, all, now, type RecordRow } from '../db';
import { vaultFor } from '../vault/github';
import { vaultCommit } from '../do/VaultWriter';
import { newId, slugify, serializeNote, normalizeTarget } from '@lem/vault-core';
import { afterWrite } from './publish';

export const people = new Hono<AppEnv>();

async function ensure(c: Context<AppEnv>, type: 'person' | 'tag', name: string, extra: Record<string, unknown>) {
  const slug = slugify(name);
  if (!slug) return c.json({ error: 'name required' }, 400);
  const path = `${type === 'person' ? 'people' : 'tags'}/${slug}`;
  const existing = await one<RecordRow>(c.env.DB, 'SELECT * FROM records WHERE path = ?', path);
  if (existing) return c.json({ id: existing.id, path, name: existing.title, visibility: existing.visibility, created: false });
  const t = now();
  const fm = { id: newId(type), type, name, visibility: type === 'person' ? 'private' : 'public', ...extra, created: t };
  await vaultCommit(c.env, { message: `${type}: ${name}`, ops: [{ op: 'create', path: `${path}.md`, contents: serializeNote(fm, ''), ifAbsent: true }] });
  const fresh = await vaultFor(c.env).readFile(`${path}.md`);
  if (fresh) await afterWrite(c.env, c.executionCtx, { before: null, path: `${path}.md`, text: fresh.text, sha: fresh.sha });
  return c.json({ id: fm.id, path, name, visibility: fm.visibility, created: true }, 201);
}

people.post('/api/people', requireOwner, async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: string; visibility?: string; public_alias?: string };
  return ensure(c, 'person', String(b.name ?? '').trim(), { ...(b.visibility === 'public' ? { visibility: 'public' } : {}), ...(b.public_alias ? { public_alias: b.public_alias } : {}) });
});
people.post('/api/tags', requireOwner, async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: string; description?: string };
  return ensure(c, 'tag', String(b.name ?? '').trim().replace(/^#/, ''), b.description ? { description: b.description } : {});
});

/** Everything that mentions a person (related: mention / related) or names them as a gift recipient (for:). */
people.get('/api/people/:id/mentions', requireOwner, async (c) => {
  const person = await one<RecordRow>(c.env.DB, "SELECT * FROM records WHERE type = 'person' AND (id = ? OR path = ?)", c.req.param('id'), normalizeTarget(c.req.param('id')));
  if (!person) return c.json({ error: 'person not found' }, 404);
  const stem = person.path.split('/').pop()!;
  const rows = await all<RecordRow & { via: string }>(c.env.DB, "SELECT r.*, 'related' AS via FROM records r, json_each(json_extract(r.frontmatter_json, '$.related')) j WHERE json_extract(j.value, '$.to') LIKE ? OR json_extract(j.value, '$.to') LIKE ? UNION SELECT r.*, 'for' AS via FROM records r WHERE json_extract(r.frontmatter_json, '$.for') LIKE ? OR json_extract(r.frontmatter_json, '$.for') LIKE ?", `%[[${person.path}]]%`, `%[[${stem}]]%`, `%[[${person.path}]]%`, `%[[${stem}]]%`);
  const all1 = c.req.query('all') === '1';
  return c.json({ mentions: rows.filter((r) => all1 || r.visibility === 'public').map((r) => ({ id: r.id, path: r.path, type: r.type, kind: r.kind, title: r.title, visibility: r.visibility, via: r.via })) });
});
