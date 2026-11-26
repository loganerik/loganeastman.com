// Identity rules: what a URL tells us before any model runs, and how to judge a search result.
export type Provider = 'tmdb' | 'imdb' | 'openlibrary' | 'isbn' | 'musicbrainz' | 'spotify' | 'bandcamp' | 'letterboxd' | 'goodreads';
export interface UrlHint { provider: Provider; external_id: string; kind?: 'film' | 'tv' | 'book' | 'album'; media_type?: 'movie' | 'tv' }

export function hintFromUrl(url: string): UrlHint | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const p = u.pathname;
  let m: RegExpExecArray | null;
  if (host === 'themoviedb.org' && (m = /^\/(movie|tv)\/(\d+)/.exec(p))) return { provider: 'tmdb', external_id: m[2]!, media_type: m[1] as 'movie' | 'tv', kind: m[1] === 'tv' ? 'tv' : 'film' };
  if (host === 'imdb.com' && (m = /\/title\/(tt\d+)/.exec(p))) return { provider: 'imdb', external_id: m[1]! };
  if (host === 'letterboxd.com' && (m = /^\/film\/([^/]+)/.exec(p))) return { provider: 'letterboxd', external_id: m[1]!, kind: 'film' };
  if (host === 'openlibrary.org' && (m = /\/(works|books)\/(OL\d+[WM])/.exec(p))) return { provider: 'openlibrary', external_id: m[2]!, kind: 'book' };
  if (host === 'goodreads.com' && (m = /\/book\/show\/(\d+)/.exec(p))) return { provider: 'goodreads', external_id: m[1]!, kind: 'book' };
  if (host === 'musicbrainz.org' && (m = /\/release-group\/([0-9a-f-]{36})/.exec(p))) return { provider: 'musicbrainz', external_id: m[1]!, kind: 'album' };
  if (host === 'open.spotify.com' && (m = /\/album\/([A-Za-z0-9]+)/.exec(p))) return { provider: 'spotify', external_id: m[1]!, kind: 'album' };
  if (host.endsWith('bandcamp.com') && (m = /^\/album\/([^/]+)/.exec(p))) return { provider: 'bandcamp', external_id: `${host}/${m[1]}`, kind: 'album' };
  if ((m = /\b(97[89]\d{10})\b/.exec(u.toString()))) return { provider: 'isbn', external_id: m[1]!, kind: 'book' };
  return null;
}

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\d{4}\)\s*$/, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Title (and optional year) parsed from a page title like "The Brutalist (2024) · Letterboxd". */
export function titleYearFrom(s: string | undefined): { title: string; year?: number } | null {
  if (!s) return null;
  const cleaned = s.split(/\s[|·•–—-]\s/)[0]!.trim();
  const m = /^(.*?)\s*\((\d{4})\)\s*(?:directed by.*)?$/i.exec(cleaned);
  if (m) return { title: m[1]!.trim(), year: Number(m[2]) };
  const m2 = /^(.*?),\s*(\d{4})$/.exec(cleaned);
  if (m2) return { title: m2[1]!.trim(), year: Number(m2[2]) };
  return cleaned ? { title: cleaned } : null;
}

export interface Candidate { id: string; title: string; year?: number; popularity?: number; extra?: Record<string, unknown> }
export type Match = { match: 'confident'; candidate: Candidate } | { match: 'ambiguous'; candidates: Candidate[] } | { match: 'none' };

/** Confident when the top title matches and the year is within ±1, or no year was given and the top result dominates. */
export function judge(query: { title: string; year?: number }, results: Candidate[]): Match {
  if (results.length === 0) return { match: 'none' };
  const q = normalizeTitle(query.title);
  const titled = results.filter((r) => normalizeTitle(r.title) === q);
  const pool = titled.length ? titled : results;
  const top = pool[0]!;
  const titleOk = normalizeTitle(top.title) === q;
  if (query.year) {
    const yearOk = top.year !== undefined && Math.abs(top.year - query.year) <= 1;
    if (titleOk && yearOk) return { match: 'confident', candidate: top };
    const byYear = pool.find((r) => r.year !== undefined && Math.abs(r.year - query.year!) <= 1 && normalizeTitle(r.title) === q);
    if (byYear) return { match: 'confident', candidate: byYear };
    return { match: 'ambiguous', candidates: results.slice(0, 5) };
  }
  if (titleOk && titled.length === 1) return { match: 'confident', candidate: top };
  const second = pool[1];
  if (titleOk && (!second || (top.popularity ?? 0) >= 3 * (second.popularity ?? 0))) return { match: 'confident', candidate: top };
  return { match: 'ambiguous', candidates: results.slice(0, 5) };
}
