// MusicBrainz release groups (albums) + Cover Art Archive. 1 request/second, UA required, no key.
import { getJson, type FetchLike } from './http.ts';

export interface MbAlbum { rgid: string; title: string; artist: string; year?: number; released?: string; type?: string; score?: number }

export class MusicBrainz {
  private fetchImpl: FetchLike;
  constructor(fetchImpl?: FetchLike, private base = 'https://musicbrainz.org/ws/2', private ua = 'loganeastman-site/1.0 (https://loganeastman.com)') {
    this.fetchImpl = fetchImpl ?? ((i, o) => fetch(i, o));
  }
  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('fmt', 'json');
    return getJson<T>(u.toString(), { headers: { 'user-agent': this.ua, accept: 'application/json' } }, this.fetchImpl);
  }
  async search(album: string, artist?: string): Promise<MbAlbum[]> {
    const q = artist ? `releasegroup:"${album}" AND artist:"${artist}"` : `releasegroup:"${album}"`;
    const r = await this.get<{ 'release-groups': Array<Record<string, any>> }>('/release-group', { query: q, limit: '8' });
    return r['release-groups'].map((g) => ({ rgid: g.id, title: g.title, artist: (g['artist-credit'] ?? []).map((a: { name: string }) => a.name).join(', '), year: g['first-release-date'] ? Number(String(g['first-release-date']).slice(0, 4)) : undefined, released: /^\d{4}-\d{2}-\d{2}$/.test(String(g['first-release-date'] ?? '')) ? g['first-release-date'] : undefined, type: g['primary-type'], score: Number(g.score ?? 0) }));
  }
  async releaseGroup(rgid: string): Promise<MbAlbum | null> {
    const g = await this.get<Record<string, any>>(`/release-group/${rgid}`, { inc: 'artist-credits' }).catch(() => null);
    if (!g) return null;
    return { rgid, title: g.title, artist: (g['artist-credit'] ?? []).map((a: { name: string }) => a.name).join(', '), year: g['first-release-date'] ? Number(String(g['first-release-date']).slice(0, 4)) : undefined, released: /^\d{4}-\d{2}-\d{2}$/.test(String(g['first-release-date'] ?? '')) ? g['first-release-date'] : undefined, type: g['primary-type'] };
  }
  static coverUrl(rgid: string, size: 250 | 500 | 1200 = 500): string {
    return `https://coverartarchive.org/release-group/${rgid}/front-${size}`;
  }
}
