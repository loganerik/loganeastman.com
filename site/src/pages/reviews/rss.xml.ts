import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { index } from '../../lib/content';
import { feedItem } from '../../lib/feeds';
import identity from '@theme/identity';
import type { Review } from '@lem/vault-core';
export const GET: APIRoute = async (ctx) => {
  const idx = await index();
  const rs = idx.ofType<Review>('review').sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  const items = await Promise.all(rs.slice(0, 50).map((p) => feedItem(p, idx)));
  return rss({ title: `${identity.site.name} · Reviews`, description: 'Reviews.', site: ctx.site ?? identity.site.url, items, trailingSlash: true });
};
