// Cloudflare cache purge for URLs whose visibility flipped. Hash-named media is immutable, so this only matters
// for pages and for media that just became private.
import type { Env } from '../env';

export async function purgeUrls(env: Env, urls: string[]): Promise<void> {
  if (!env.CF_ZONE_ID || !env.CF_PURGE_TOKEN || urls.length === 0) return;
  for (let i = 0; i < urls.length; i += 30) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_PURGE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ files: urls.slice(i, i + 30) }),
    }).catch(() => {});
  }
}

/** Public URLs a record owns: its page and every /m/ URL in its artwork. */
export function urlsForRecord(env: Env, rec: { type: string; kind: string | null; path: string; frontmatter_json: string | null }): string[] {
  const base = env.SITE_URL.replace(/\/$/, '');
  const stem = rec.path.split('/').pop()!;
  const routes: Record<string, string> = { film: 'film', tv: 'tv', book: 'books', album: 'albums', product: 'things', place: 'places', link: 'links', photo: 'photos' };
  const out: string[] = [];
  const fmAll = (() => { try { return JSON.parse(rec.frontmatter_json ?? '{}') as Record<string, unknown>; } catch { return {}; } })();
  const wl = (v: unknown) => String(v ?? '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');
  if (rec.type === 'item') out.push(`${base}/${routes[rec.kind ?? ''] ?? rec.kind}/${stem}/`);
  else if (rec.type === 'list') out.push(`${base}/lists/${stem}/`, `${base}/lists/`);
  else if (rec.type === 'list-entry') {
    const list = wl(fmAll.list).split('/').pop(); const item = wl(fmAll.item);
    if (list) out.push(`${base}/lists/${list}/`);
    const parts = item.split('/'); const folder = parts[1]; const itemStem = parts.pop();
    const byFolder: Record<string, string> = { films: 'film', tv: 'tv', books: 'books', albums: 'albums', products: 'things', places: 'places', links: 'links', photos: 'photos' };
    if (folder && itemStem && byFolder[folder]) out.push(`${base}/${byFolder[folder]}/${itemStem}/`);
    out.push(`${base}/lists/`);
  }
  else if (rec.type === 'feed') out.push(`${base}/feed/${stem}/`, `${base}/feed/`);
  else if (rec.type === 'review') out.push(`${base}/reviews/${stem.replace(/^\d{4}-\d{2}-\d{2}-/, '')}/`, `${base}/reviews/`);
  else if (rec.type === 'writing') out.push(`${base}/writing/`, `${base}/writing/${String(fmAll.collection ?? '')}/`, `${base}/writing/${String(fmAll.collection ?? '')}/${stem.replace(/^\d{4}-\d{2}-\d{2}-/, '')}/`);
  else if (rec.type === 'person') out.push(`${base}/people/${stem}/`);
  else if (rec.type === 'tag') out.push(`${base}/tags/${stem}/`);
  try {
    const fm = JSON.parse(rec.frontmatter_json ?? '{}') as { artwork?: Record<string, unknown> };
    for (const v of Object.values(fm.artwork ?? {})) if (typeof v === 'string' && v.startsWith('/m/')) out.push(base + v);
  } catch { /* ignore */ }
  out.push(`${base}/`, `${base}/rss.xml`, `${base}/feed.json`);
  return out;
}
