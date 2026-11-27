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
  // an owner call succeeded: let public pages reveal their controls from now on
  try { localStorage.setItem('ownerHint', '1'); } catch { /* ignore */ }
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

// ---- typed helpers used by the owner UI kit ----
export interface Loaded { id: string; path: string; type: string; frontmatter: Record<string, unknown>; body: string; raw: string; sha: string; conflict: { ours: string; theirs: string } | null }
export const getRecord = (id: string) => api<Loaded>(`/api/records/${encodeURIComponent(id)}`);
export const saveRecord = (id: string, frontmatter: Record<string, unknown>, body: string, base_sha?: string) =>
  api<{ ok: boolean; sha: string }>(`/api/records/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ frontmatter, body, base_sha }) });
export const createRecord = (type: string, frontmatter: Record<string, unknown>, body = '') =>
  api<{ id: string; path: string; sha: string; frontmatter: Record<string, unknown>; body: string }>('/api/records', { method: 'POST', body: JSON.stringify({ type, frontmatter, body }) });
export interface DeleteDryRun { type: string; title: string | null; entries: number; items_kept: number; reviews: number; paths: string[] }
export const deleteRecord = (id: string, opts: { cascade?: boolean; dryRun?: boolean; keepalive?: boolean } = {}) => {
  const q = new URLSearchParams(); if (opts.cascade) q.set('cascade', '1'); if (opts.dryRun) q.set('dry_run', '1');
  return api<DeleteDryRun | { ok: boolean }>(`/api/records/${encodeURIComponent(id)}${q.size ? '?' + q : ''}`, { method: 'DELETE', keepalive: opts.keepalive });
};
export const setVisibility = (id: string, visibility: 'public' | 'private', cascade = false) =>
  api<{ ok: boolean; changed: string[] }>(`/api/records/${encodeURIComponent(id)}/visibility`, { method: 'POST', body: JSON.stringify({ visibility, cascade }) });
export const listRecords = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  return api<{ records: RecordSummary[] }>(`/api/records?${q}`);
};
export interface CollectionDef { key: string; title: string; path?: string; form: 'arch' | 'stepped'; feed: boolean; nav: boolean }
export interface ListTypeDef { key: string; title: string; queue: boolean; item_kinds: string[]; default_for: string[]; add_label?: string; private_default: boolean; allow_for: boolean; form?: string; done?: boolean; completion?: { list: string; label?: string } }
export interface SiteConfig { title: string; url: string; timezone: string; mention_policy: string; rating_scale?: number; categories?: string[]; [k: string]: unknown }
export interface Config { site: SiteConfig; collections: CollectionDef[]; listTypes: ListTypeDef[] }
let cfgPromise: Promise<Config> | null = null;
/** One config fetch per page; `fresh` after a config save. */
export function getConfig(fresh = false): Promise<Config> {
  if (!cfgPromise || fresh) cfgPromise = api<Config>(`/api/config${fresh ? '?fresh=1' : ''}`).catch((e) => { cfgPromise = null; throw e; });
  return cfgPromise;
}
export const KIND_LABELS: Record<string, string> = { film: 'Film', tv: 'Series', book: 'Book', album: 'Album', product: 'Thing', place: 'Place', link: 'Link', photo: 'Photo' };
/** A human label for a record: "Columns", "Film", "Watchlist", "Thought"… never a raw key. */
export function humanKind(r: { type: string; kind?: string | null; collection?: string | null; list_type?: string | null }, cfg?: Config | null): string {
  switch (r.type) {
    case 'writing': return cfg?.collections.find((c) => c.key === r.collection)?.title ?? (r.collection ?? 'Writing');
    case 'item': return KIND_LABELS[r.kind ?? ''] ?? 'Thing';
    case 'list': return cfg?.listTypes.find((t) => t.key === r.list_type)?.title ?? 'List';
    case 'feed': return 'Thought';
    case 'review': return 'Review';
    case 'list-entry': return 'On a list';
    case 'person': return 'Person';
    case 'tag': return 'Tag';
    default: return r.type;
  }
}
