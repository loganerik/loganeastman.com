import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { index } from '../../lib/content';
import { feedItem } from '../../lib/feeds';
import identity from '@theme/identity';
import type { Writing } from '@lem/vault-core';
export const GET: APIRoute = async (ctx) => {
  const idx = await index();
  const pieces = idx.ofType<Writing>('writing').filter((w) => !identity.writing.rootCollections.includes(w.data.collection)).sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  const items = await Promise.all(pieces.slice(0, 50).map((p) => feedItem(p, idx)));
  return rss({ title: `${identity.site.name} · Writing`, description: 'Longer pieces.', site: ctx.site ?? identity.site.url, items, trailingSlash: true });
};
