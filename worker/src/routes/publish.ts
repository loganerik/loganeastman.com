// What happens after the vault changes: reindex the file, and if the record's public face changed (visibility,
// draft, deletion) purge the cached pages now and again once the next build has deployed, so the old page
// cannot be re-cached in between. The post-deploy pass runs from the first request a freshly deployed Worker sees.
import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { one, type RecordRow } from '../db';
import { indexFile } from './github';
import { purgeUrls, urlsForRecord } from '../media/purge';

const PENDING = 'purge-pending';

export async function queuePurge(env: Env, urls: string[]): Promise<void> {
  if (!urls.length) return;
  const cur = JSON.parse((await env.KV.get(PENDING)) ?? '[]') as string[];
  const next = [...new Set([...cur, ...urls])].slice(-500);
  await env.KV.put(PENDING, JSON.stringify(next), { expirationTtl: 86_400 });
}

export async function drainPurge(env: Env): Promise<number> {
  const urls = JSON.parse((await env.KV.get(PENDING)) ?? '[]') as string[];
  if (!urls.length) return 0;
  await env.KV.delete(PENDING);
  await purgeUrls(env, urls);
  return urls.length;
}

const facing = (row: Pick<RecordRow, 'visibility' | 'frontmatter_json'> | null | undefined) => {
  if (!row) return 'absent';
  const fm = JSON.parse(row.frontmatter_json ?? '{}') as { draft?: boolean };
  return row.visibility === 'public' && !fm.draft ? 'public' : 'hidden';
};

/** Reindex a written file and purge if its public face changed. `before` is the D1 row as it was before the write. */
export async function afterWrite(env: Env, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, args: { before: RecordRow | null; path: string; text: string; sha: string | null }): Promise<{ purged: string[] }> {
  await indexFile(env, args.path, args.text, args.sha);
  const after = await one<RecordRow>(env.DB, 'SELECT * FROM records WHERE path = ?', args.path.replace(/\.md$/, ''));
  const was = facing(args.before), is = facing(after);
  const urls = new Set<string>();
  if (was !== is || (was === 'public' && is === 'public' && args.before?.path !== after?.path)) {
    for (const r of [args.before, after]) if (r) for (const u of urlsForRecord(env, r)) urls.add(u);
  }
  const list = [...urls];
  if (list.length) {
    const p = Promise.all([purgeUrls(env, list), queuePurge(env, list)]).then(() => {});
    if (ctx) ctx.waitUntil(p); else await p;
  }
  return { purged: list };
}

/** Purge for records that were deleted (their rows are gone, so pass them in). */
export async function afterDelete(env: Env, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, rows: RecordRow[]): Promise<void> {
  const urls = [...new Set(rows.filter((r) => facing(r) === 'public').flatMap((r) => urlsForRecord(env, r)))];
  if (!urls.length) return;
  const p = Promise.all([purgeUrls(env, urls), queuePurge(env, urls)]).then(() => {});
  if (ctx) ctx.waitUntil(p); else await p;
}

export const publish = new Hono<AppEnv>();

/** First request after a deploy: the HTML is new, so the pending purges can land for good. */
publish.use('*', async (c, next) => {
  const build = c.env.BUILD_ID;
  if (build) {
    const seen = await c.env.KV.get('deployed-build').catch(() => null);
    if (seen !== build) {
      c.executionCtx.waitUntil((async () => { await c.env.KV.put('deployed-build', build); await drainPurge(c.env); })());
    }
  }
  await next();
});

/** Manual drain (owner), for when a purge is wanted without waiting for a deploy. */
publish.post('/api/purge', async (c) => {
  const p = c.get('principal');
  if (p?.kind !== 'owner') return c.json({ error: 'owner sign-in required' }, 401);
  const n = await drainPurge(c.env);
  return c.json({ ok: true, purged: n });
});
