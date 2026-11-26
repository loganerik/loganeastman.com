// Thin client for the owner API. A 401 bounces to the Access login and back.
export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 401) {
    location.href = '/api/login?next=' + encodeURIComponent(location.pathname + location.search);
    throw new ApiError('sign in', 401);
  }
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ApiError((body as { error?: string })?.error ?? `${r.status}`, r.status, body);
  return body as T;
}

export const when = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) => (iso ? new Date(iso).toLocaleString(undefined, opts) : '');

export interface RecordSummary { id: string; path: string; type: string; kind: string | null; title: string | null; visibility: string | null; draft: boolean; date: string | null; collection: string | null; list_type: string | null; year: number | null; conflict: boolean; excerpt: string | null; tags: string[] }
export interface Capture { id: string; client_id: string | null; url: string | null; text: string | null; title: string | null; why: string; intent: string | null; visibility: string; status: string; error: string | null; created_at: string; result: { item?: { id: string; path: string; created: boolean; url?: string }; records?: Array<{ id: string; path: string; type: string; created: boolean }> } | null; question?: { question: string; options: string[] } | null }
export interface Question { id: string; capture_id: string | null; record_id: string | null; question: string; options_json: string; status: string; created_at: string }

const KIND_ROUTES: Record<string, string> = { film: 'film', tv: 'tv', book: 'books', album: 'albums', product: 'things', place: 'places', link: 'links', photo: 'photos' };
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
/** Public URL for a record summary (mirrors src/lib/urls.ts without importing the vault index). */
export function publicUrl(r: RecordSummary, rootCollections: string[] = ['pages']): string | null {
  const stem = r.path.split('/').pop()!;
  switch (r.type) {
    case 'item': return `/${KIND_ROUTES[r.kind ?? ''] ?? r.kind}/${stem}/`;
    case 'list': return `/lists/${stem}/`;
    case 'writing': return rootCollections.includes(r.collection ?? '') ? `/${stem.replace(DATE_PREFIX, '')}/` : `/writing/${r.collection}/${stem.replace(DATE_PREFIX, '')}/`;
    case 'feed': return `/feed/${stem}/`;
    case 'review': return `/reviews/${stem.replace(DATE_PREFIX, '')}/`;
    case 'person': return `/people/${stem}/`;
    case 'tag': return `/tags/${stem}/`;
    default: return null;
  }
}
