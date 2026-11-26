import type { APIRoute } from 'astro';
import { index } from '../lib/content';
import { everything } from '../lib/feeds';
import identity from '@theme/identity';
export const GET: APIRoute = async () => {
  const idx = await index();
  const items = await everything(idx);
  const body = {
    version: 'https://jsonfeed.org/version/1.1',
    title: identity.site.name,
    home_page_url: identity.site.url,
    feed_url: `${identity.site.url}/feed.json`,
    description: identity.site.description,
    items: items.map((i) => ({ id: i.link, url: i.link, title: i.title, content_html: i.content, summary: i.description, date_published: i.pubDate.toISOString(), tags: i.categories })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'content-type': 'application/feed+json; charset=utf-8' } });
};
