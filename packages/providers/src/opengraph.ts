// Fetch a page and pull the facts a human would read off it: title, description, image, site name, JSON-LD.
import type { FetchLike } from './http.ts';

export interface PageFacts { url: string; final_url: string; title?: string; description?: string; image?: string; site_name?: string; type?: string; jsonld: unknown[]; html_title?: string; icon?: string; product?: ProductFacts }
export interface ProductFacts { price?: number; currency?: string; brand?: string; category?: string; availability?: string }

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]|.*\.local)$/i;

export async function fetchPageFacts(url: string, fetchImpl: FetchLike = (i, o) => fetch(i, o), opts: { timeoutMs?: number; maxBytes?: number; via?: string } = {}): Promise<PageFacts> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) throw new Error('refusing to fetch private or non-http url');
  // dev: route the request through a mock while keeping the real URL for identity hints
  const target = opts.via ? `${opts.via}/${u.host}${u.pathname}${u.search}` : url;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchImpl(target, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; loganeastman-capture/1.0)', accept: 'text/html,application/xhtml+xml' } });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const max = opts.maxBytes ?? 1_000_000;
    while (reader) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
      if (size > max) {
        await reader.cancel();
        break;
      }
    }
    const html = new TextDecoder().decode(concat(chunks));
    return { url, final_url: res.url || url, ...parseHtmlFacts(html) };
  } finally {
    clearTimeout(t);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();

export function parseHtmlFacts(html: string): Omit<PageFacts, 'url' | 'final_url'> {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content !== undefined && !(key in meta)) meta[key] = decode(content);
  }
  const jsonld: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1]!.trim());
      jsonld.push(...(Array.isArray(v) ? v : [v]));
    } catch {
      /* ignore */
    }
  }
  const html_title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  // touch icon / icon for the brand-mark fallback
  let icon: string | undefined;
  for (const m of html.matchAll(/<link\s+[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    if (/apple-touch-icon/.test(rel)) { icon = href; break; }
    if (!icon && /\bicon\b/.test(rel) && /\.(png|svg|webp)(\?|$)/i.test(href)) icon = href;
  }
  const product = productFacts(meta, jsonld);
  return {
    title: meta['og:title'] ?? meta['twitter:title'] ?? (html_title ? decode(html_title) : undefined),
    description: meta['og:description'] ?? meta['description'] ?? meta['twitter:description'],
    image: meta['og:image'] ?? meta['twitter:image'],
    site_name: meta['og:site_name'],
    type: meta['og:type'],
    jsonld,
    html_title: html_title ? decode(html_title) : undefined,
    icon,
    product,
  };
}

const APPAREL = /\b(shirt|tee|t-shirt|sweatshirt|hoodie|jacket|coat|jeans|pants|trousers|shorts|socks?|sweater|cardigan|knit|denim|boots?|sneakers?|shoes?|cap|hat|beanie|scarf|gloves?)\b/i;
const TEE = /\b(tee|t-shirt|crew neck)\b/i;

function productFacts(meta: Record<string, string>, jsonld: unknown[]): ProductFacts | undefined {
  const out: ProductFacts = {};
  const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : undefined; };
  if (meta['product:price:amount']) { out.price = num(meta['product:price:amount']); out.currency = meta['product:price:currency']; }
  if (meta['og:price:amount']) { out.price ??= num(meta['og:price:amount']); out.currency ??= meta['og:price:currency']; }
  if (meta['product:brand']) out.brand = meta['product:brand'];
  const nodes: Record<string, unknown>[] = [];
  const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { nodes.push(v as Record<string, unknown>); for (const x of Object.values(v as Record<string, unknown>)) if (x && typeof x === 'object') walk(x); } };
  walk(jsonld);
  const prod = nodes.find((n) => /Product/.test(String(n['@type'] ?? '')));
  if (prod) {
    const brand = prod.brand as { name?: string } | string | undefined;
    out.brand ??= typeof brand === 'string' ? brand : brand?.name;
    out.category ??= typeof prod.category === 'string' ? prod.category : undefined;
    const offers = ([] as unknown[]).concat(prod.offers ?? []) as Array<Record<string, unknown>>;
    const prices = offers.map((o) => num(o.price ?? (o.priceSpecification as { price?: unknown })?.price)).filter((x): x is number => x !== undefined);
    if (prices.length && out.price === undefined && (new Set(prices).size === 1)) { out.price = prices[0]; out.currency ??= String(offers[0]?.priceCurrency ?? ''); }
    out.availability = String(offers[0]?.availability ?? '').split('/').pop() || undefined;
  }
  const title = meta['og:title'] ?? '';
  if (!out.category && APPAREL.test(title)) out.category = 'Apparel';
  if (out.currency && out.currency.toUpperCase() !== 'USD') out.price = undefined; // only USD prices are shown
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

/** A category from the title alone (shops that block us still have a telling slug). */
export function guessCategory(title: string): string | undefined {
  return APPAREL.test(title) ? 'Apparel' : undefined;
}

/** Colour and size a shop puts in the link (?variant=fog-harbor&size=l → "Fog Harbor · Size L"). */
export function detailsFromUrl(url: string): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const nice = (v: string) => v.replace(/[-_+]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const parts: string[] = [];
  for (const k of ['color', 'colour', 'variant', 'style', 'finish']) { const v = u.searchParams.get(k); if (v && !/^\d+$/.test(v)) { parts.push(nice(v)); break; } }
  for (const k of ['size', 'sz']) { const v = u.searchParams.get(k); if (v) { parts.push(`Size ${v.length <= 3 ? v.toUpperCase() : nice(v)}`); break; } }
  return parts.length ? parts.join(' · ') : undefined;
}

export function apparelSubtype(title: string): string | undefined {
  if (TEE.test(title)) return 'T-shirts';
  const m = /\b(sweatshirt|hoodie|jeans|socks?|sweater|jacket|coat|shorts|hat|cap|boots?|sneakers?)\b/i.exec(title);
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase().replace(/^sock$/, 'socks') : undefined;
}

