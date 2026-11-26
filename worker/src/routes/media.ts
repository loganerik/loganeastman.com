// Public media: /m/<media_id>/<variant>-<hash8>.<ext>. Served only when the deployed build's manifest lists it,
// so pages and artwork can never disagree about what is public.
import { Hono } from 'hono';
import type { AppEnv } from '../env';

interface Manifest { generated: string; records: Record<string, string>; media: string[] }
let manifestCache: { etag: string; set: Set<string>; at: number } | null = null;

export async function publicMedia(env: AppEnv['Bindings'], origin: string): Promise<Set<string>> {
  if (manifestCache && Date.now() - manifestCache.at < 60_000) return manifestCache.set;
  const res = await env.ASSETS.fetch(new Request(`${origin}/public-manifest.json`));
  if (!res.ok) return manifestCache?.set ?? new Set();
  const etag = res.headers.get('etag') ?? '';
  if (manifestCache && manifestCache.etag === etag) {
    manifestCache.at = Date.now();
    return manifestCache.set;
  }
  const m = (await res.json()) as Manifest;
  manifestCache = { etag, set: new Set(m.media), at: Date.now() };
  return manifestCache.set;
}

export const media = new Hono<AppEnv>();

media.get('/m/:id/:file', async (c) => {
  const { id, file } = c.req.param();
  if (!/^med_[0-9a-z]{12}$/.test(id) || !/^[a-z]+-[0-9a-f]{8}\.[a-z0-9]+$/.test(file)) return c.notFound();
  const allowed = await publicMedia(c.env, new URL(c.req.url).origin);
  if (!allowed.has(`${id}/${file}`)) return c.notFound();
  const obj = await c.env.MEDIA.get(`derived/${id}/${file}`);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers });
});
