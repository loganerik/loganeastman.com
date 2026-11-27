// Open Library: books by ISBN, OLID, or title/author search. Free, no key. Dates are messy; keep only what parses.
import { getJson, type FetchLike } from './http.ts';

export interface OlBook { olid: string; title: string; authors: string[]; year?: number; published?: string; publisher?: string; isbn13?: string; cover_id?: number; popularity?: number; description?: string }
const desc = (v: unknown): string | undefined => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string' ? (v as { value: string }).value : undefined);

export class OpenLibrary {
  private fetchImpl: FetchLike;
  constructor(fetchImpl?: FetchLike, private base = 'https://openlibrary.org') {
    this.fetchImpl = fetchImpl ?? ((i, o) => fetch(i, o));
  }
  async search(q: string, opts: { author?: string } = {}): Promise<OlBook[]> {
    const u = new URL(this.base + '/search.json');
    u.searchParams.set('title', q);
    if (opts.author) u.searchParams.set('author', opts.author);
    u.searchParams.set('limit', '8');
    u.searchParams.set('fields', 'key,title,author_name,first_publish_year,publisher,isbn,cover_i,edition_count');
    const r = await getJson<{ docs: Array<Record<string, any>> }>(u.toString(), { headers: { 'user-agent': 'loganeastman-worker (contact via site)' } }, this.fetchImpl);
    return r.docs.map((d) => ({
      olid: String(d.key ?? '').replace('/works/', ''),
      title: String(d.title ?? ''),
      authors: (d.author_name ?? []) as string[],
      year: d.first_publish_year ? Number(d.first_publish_year) : undefined,
      publisher: Array.isArray(d.publisher) ? d.publisher[0] : undefined,
      isbn13: ((d.isbn ?? []) as string[]).find((i) => i.length === 13),
      cover_id: d.cover_i ? Number(d.cover_i) : undefined,
      popularity: Number(d.edition_count ?? 0),
    }));
  }
  async byIsbn(isbn: string): Promise<OlBook | null> {
    const d = await getJson<Record<string, any>>(`${this.base}/isbn/${isbn}.json`, {}, this.fetchImpl).catch(() => null);
    if (!d) return null;
    const workKey = d.works?.[0]?.key as string | undefined;
    const work = workKey ? await getJson<Record<string, any>>(`${this.base}${workKey}.json`, {}, this.fetchImpl).catch(() => null) : null;
    const authors: string[] = [];
    for (const a of work?.authors ?? []) {
      const key = a?.author?.key as string | undefined;
      if (!key) continue;
      const ad = await getJson<{ name?: string }>(`${this.base}${key}.json`, {}, this.fetchImpl).catch(() => null);
      if (ad?.name) authors.push(ad.name);
    }
    const published = typeof d.publish_date === 'string' ? d.publish_date : undefined;
    return { olid: workKey?.replace('/works/', '') ?? String(d.key).replace('/books/', ''), title: String(d.title ?? work?.title ?? ''), authors, year: published ? Number(/\d{4}/.exec(published)?.[0]) || undefined : undefined, published: parseDate(published), publisher: Array.isArray(d.publishers) ? d.publishers[0] : undefined, isbn13: isbn.length === 13 ? isbn : (d.isbn_13?.[0] as string | undefined), cover_id: d.covers?.[0], description: desc(work?.description ?? d.description)?.split('\n')[0]?.trim() };
  }
  async byOlid(olid: string): Promise<OlBook | null> {
    const kind = olid.endsWith('M') ? 'books' : 'works';
    const d = await getJson<Record<string, any>>(`${this.base}/${kind}/${olid}.json`, {}, this.fetchImpl).catch(() => null);
    if (!d) return null;
    const authors: string[] = [];
    for (const a of d.authors ?? []) {
      const key = (a?.author?.key ?? a?.key) as string | undefined;
      if (!key) continue;
      const ad = await getJson<{ name?: string }>(`${this.base}${key}.json`, {}, this.fetchImpl).catch(() => null);
      if (ad?.name) authors.push(ad.name);
    }
    return { olid, title: String(d.title ?? ''), authors, year: d.first_publish_date ? Number(/\d{4}/.exec(String(d.first_publish_date))?.[0]) || undefined : undefined, cover_id: d.covers?.[0], description: desc(d.description)?.split('\n')[0]?.trim() };
  }
  static coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'L'): string {
    return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
  }
}

/** Only full YYYY-MM-DD survives; "March 2019" or "2019" do not become a date. */
export function parseDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) return s.trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{1,2}/.test(s) && /[A-Za-z]{3,}/.test(s) && /\d{4}/.test(s) && /\d{1,2}[,\s]/.test(s)) return d.toISOString().slice(0, 10);
  return undefined;
}
