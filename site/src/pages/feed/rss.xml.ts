import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { index, feedPosts } from '../../lib/content';
import { feedItem } from '../../lib/feeds';
import identity from '@theme/identity';
export const GET: APIRoute = async (ctx) => {
  const idx = await index();
  const items = await Promise.all(feedPosts(idx).slice(0, 50).map((p) => feedItem(p, idx)));
  return rss({ title: `${identity.site.name} · Feed`, description: 'Short thoughts.', site: ctx.site ?? identity.site.url, items, trailingSlash: true });
};
