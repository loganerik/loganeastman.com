import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { index } from '../lib/content';
import { everything } from '../lib/feeds';
import identity from '@theme/identity';
export const GET: APIRoute = async (ctx) => {
  const idx = await index();
  return rss({ title: identity.site.name, description: identity.site.description, site: ctx.site ?? identity.site.url, items: await everything(idx), trailingSlash: true });
};
