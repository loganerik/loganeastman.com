// Fetch a page and pull the facts a human would read off it: title, description, image, site name, JSON-LD.
import type { FetchLike } from './http.ts';

export interface PageFacts { url: string; final_url: string; title?: string; description?: string; image?: string; site_name?: string; type?: string; jsonld: unknown[]; html_title?: string }

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
  return {
    title: meta['og:title'] ?? meta['twitter:title'] ?? (html_title ? decode(html_title) : undefined),
    description: meta['og:description'] ?? meta['description'] ?? meta['twitter:description'],
    image: meta['og:image'] ?? meta['twitter:image'],
    site_name: meta['og:site_name'],
    type: meta['og:type'],
    jsonld,
    html_title: html_title ? decode(html_title) : undefined,
  };
}
