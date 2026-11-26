import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { one } from '../db';
import { enqueue } from '../processor/jobs';

export const mediaAttach = defineTool({
  name: 'media_attach',
  description: 'Attach artwork to a record: a provider reference (tmdb:/path.jpg, tmdb-logo:/x.png, openlibrary:<cover id>, caa:<release-group>) or any image URL. Derivatives are generated and the record patched.',
  input: z.object({ record_id: z.string(), poster: z.string().optional(), logo: z.string().optional(), cover: z.string().optional(), url: z.string().url().optional(), cutout: z.boolean().default(false) }),
  scopes: ['media:write'],
  async handler({ env }, { record_id, poster, logo, cover, url, cutout }) {
    const rec = await one<{ id: string; path: string }>(env.DB, 'SELECT id, path FROM records WHERE id = ?', record_id);
    if (!rec) throw new ToolError('record not found', 404);
    if (!poster && !logo && !cover && !url) throw new ToolError('give a poster, logo, cover, or url');
    await enqueue(env, 'derive_media', rec.id, `media:${rec.id}:${Date.now()}`, { record_path: `${rec.path}.md`, poster, logo, cover, og: url ? `url:${url}` : undefined });
    if (cutout) await enqueue(env, 'derive_clip', rec.id, `clip:${rec.id}:${Date.now()}`, { record_path: `${rec.path}.md`, media_id: rec.id, provider: env.REPLICATE_TOKEN ? 'replicate' : 'local' }, 15_000);
    return { queued: true };
  },
});
