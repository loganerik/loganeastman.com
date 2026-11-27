// When a shop or site page gives no usable picture, find one: the page's social image, its touch icon,
// then a brand mark. Marks are shown whole (treatment "cover"), never cut out.
import { fetchPageFacts } from '@lem/providers';

export interface FoundImage { url: string; source: 'og' | 'icon' | 'logo' | 'favicon'; bytes: ArrayBuffer; contentType: string }

async function probe(url: string, source: FoundImage['source'], fetchImpl: typeof fetch): Promise<FoundImage | null> {
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; loganeastman-capture/1.0)', accept: 'image/*' }, redirect: 'follow' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpe?g|webp|avif|gif)/.test(ct)) return null; // no icons, no svg: they don't read as artwork
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 1500) return null; // tiny favicons are not worth showing
    return { url, source, bytes, contentType: ct };
  } catch {
    return null;
  }
}

export async function findImage(pageUrl: string, fetchImpl: typeof fetch = (i, o) => fetch(i, o), via?: string): Promise<FoundImage | null> {
  let host = '';
  try { host = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return null; }
  const facts = await fetchPageFacts(pageUrl, fetchImpl, { via }).catch(() => null);
  const abs = (u: string | undefined) => { try { return u ? new URL(u, facts?.final_url ?? pageUrl).toString() : undefined; } catch { return undefined; } };
  const candidates: Array<[string | undefined, FoundImage['source']]> = [
    [abs(facts?.image), 'og'],
    [abs(facts?.icon), 'icon'],
    [`https://logo.clearbit.com/${host}?size=512`, 'logo'],
  ];
  for (const [u, source] of candidates) {
    if (!u) continue;
    const f = await probe(u, source, fetchImpl);
    if (f) return f;
  }
  return null;
}
