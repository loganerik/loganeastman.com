import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { one } from '../db';
import { enqueue } from '../processor/jobs';

export const mediaAttach = defineTool({
  name: 'media_attach',
  description: 'Attach artwork to a record: a provider reference (tmdb:/path.jpg, tmdb-logo:/x.png, openlibrary:<cover id>, caa:<release-group>) or any image URL. Derivatives are generated and the record patched.',
  input: z.object({ record_id: z.string(), poster: z.string().optional(), logo: z.string().optional(), cover: z.string().optional(), url: z.string().url().optional(), find: z.boolean().default(false), cutout: z.boolean().default(false), trim: z.boolean().default(false).describe('crop white margins (covers, product shots on white); runs on the Mac') }),
  scopes: ['media:write'],
  async handler({ env }, { record_id, poster, logo, cover, url, find, cutout, trim }) {
    const rec = await one<{ id: string; path: string; kind: string | null; frontmatter_json: string | null }>(env.DB, 'SELECT id, path, kind, frontmatter_json FROM records WHERE id = ?', record_id);
    if (!rec) throw new ToolError('record not found', 404);
    const pageUrl = (JSON.parse(rec.frontmatter_json ?? '{}') as { url?: string }).url;
    if (!poster && !logo && !cover && !url && !(find && pageUrl)) throw new ToolError('give a poster, logo, cover, or url (or find: true on a record with a url)');
    if (['book', 'album', 'film', 'tv'].includes(rec.kind ?? '')) cutout = false;
    await enqueue(env, 'derive_media', rec.id, `media:${rec.id}:${Date.now()}`, { record_path: `${rec.path}.md`, poster, logo, cover, og: url ? `url:${url}` : find && pageUrl ? `find:${pageUrl}` : undefined });
    if (cutout) await enqueue(env, 'derive_clip', rec.id, `clip:${rec.id}:${Date.now()}`, { record_path: `${rec.path}.md`, media_id: rec.id, provider: env.REPLICATE_TOKEN ? 'replicate' : 'local' }, 15_000);
    if (trim) await enqueue(env, 'derive_clip', rec.id, `trim:${rec.id}:${Date.now()}`, { record_path: `${rec.path}.md`, media_id: rec.id, provider: 'local', params: { mode: 'trim' } }, poster || logo || cover || url || find ? 15_000 : 0);
    return { queued: true };
  },
});
