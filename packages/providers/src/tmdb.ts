// TMDB v3. Films + TV: identity, credits, US release dates, poster/logo references.
import { getJson, type FetchLike } from './http.ts';

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export interface TmdbSearchHit { id: number; title: string; year?: number; popularity: number; media_type: 'movie' | 'tv'; overview?: string; poster_path?: string | null }
export interface TmdbRelease { kind: 'premiere' | 'theatrical_limited' | 'theatrical' | 'digital' | 'physical' | 'tv'; date: string; note?: string }
export interface TmdbDetails {
  media_type: 'movie' | 'tv';
  id: number;
  imdb_id?: string;
  title: string;
  year?: number;
  overview: string;
  runtime?: number;
  genres: string[];
  director: string[];
  creators: string[];
  cast: string[];
  poster_path?: string;
  logo_path?: string; // transparent title treatment (en preferred)
  releases: TmdbRelease[]; // US only
  first_air_date?: string;
  next_episode?: { season: number; episode: number; air_date: string };
  status?: string;
}

const RELEASE_TYPES: Record<number, TmdbRelease['kind']> = { 1: 'premiere', 2: 'theatrical_limited', 3: 'theatrical', 4: 'digital', 5: 'physical', 6: 'tv' };

export class Tmdb {
  private fetchImpl: FetchLike;
  constructor(private token: string, fetchImpl?: FetchLike, private base = TMDB_BASE, public imageBase = TMDB_IMAGE) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const u = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return getJson<T>(u.toString(), { headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' } }, this.fetchImpl);
  }

  async search(query: string, opts: { year?: number; kind?: 'movie' | 'tv' | 'multi' } = {}): Promise<TmdbSearchHit[]> {
    const kind = opts.kind ?? 'multi';
    const params: Record<string, string> = { query, include_adult: 'false', language: 'en-US' };
    if (opts.year && kind === 'movie') params.year = String(opts.year);
    if (opts.year && kind === 'tv') params.first_air_date_year = String(opts.year);
    const r = await this.get<{ results: Array<Record<string, unknown>> }>(`/search/${kind}`, params);
    return r.results
      .filter((x) => kind !== 'multi' || x.media_type === 'movie' || x.media_type === 'tv')
      .map((x) => {
        const mt = (kind === 'multi' ? x.media_type : kind) as 'movie' | 'tv';
        const date = String(x.release_date ?? x.first_air_date ?? '');
        return {
          id: Number(x.id),
          title: String(x.title ?? x.name ?? ''),
          year: date ? Number(date.slice(0, 4)) : undefined,
          popularity: Number(x.popularity ?? 0),
          media_type: mt,
          overview: typeof x.overview === 'string' ? x.overview : undefined,
          poster_path: (x.poster_path as string | null) ?? null,
        };
      });
  }

  /** Resolve an IMDb id (tt…) to a TMDB movie/tv id. */
  async findByImdb(imdb: string): Promise<{ id: number; media_type: 'movie' | 'tv' } | null> {
    const r = await this.get<{ movie_results: Array<{ id: number }>; tv_results: Array<{ id: number }> }>(`/find/${imdb}`, { external_source: 'imdb_id' });
    if (r.movie_results[0]) return { id: r.movie_results[0].id, media_type: 'movie' };
    if (r.tv_results[0]) return { id: r.tv_results[0].id, media_type: 'tv' };
    return null;
  }

  async details(id: number, media_type: 'movie' | 'tv'): Promise<TmdbDetails> {
    const d = await this.get<Record<string, any>>(`/${media_type}/${id}`, {
      append_to_response: media_type === 'movie' ? 'credits,release_dates,external_ids,images' : 'credits,external_ids,images,content_ratings',
      include_image_language: 'en,null',
      language: 'en-US',
    });
    const crew: Array<{ job: string; name: string }> = d.credits?.crew ?? [];
    const castList: Array<{ name: string; order: number }> = d.credits?.cast ?? [];
    const logos: Array<{ file_path: string; iso_639_1: string | null; vote_average: number }> = d.images?.logos ?? [];
    const logo = [...logos].sort((a, b) => (a.iso_639_1 === 'en' ? -1 : 0) - (b.iso_639_1 === 'en' ? -1 : 0) || b.vote_average - a.vote_average)[0];
    const releases: TmdbRelease[] = [];
    if (media_type === 'movie') {
      const us = (d.release_dates?.results ?? []).find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US');
      for (const r of us?.release_dates ?? []) {
        const kind = RELEASE_TYPES[r.type as number];
        if (!kind || !r.release_date) continue;
        releases.push({ kind, date: String(r.release_date).slice(0, 10), note: r.note || undefined });
      }
    }
    const date = String(d.release_date ?? d.first_air_date ?? '');
    const next = d.next_episode_to_air;
    return {
      media_type,
      id,
      imdb_id: d.external_ids?.imdb_id ?? d.imdb_id ?? undefined,
      title: String(d.title ?? d.name ?? ''),
      year: date ? Number(date.slice(0, 4)) : undefined,
      overview: String(d.overview ?? ''),
      runtime: media_type === 'movie' ? d.runtime || undefined : d.episode_run_time?.[0] || undefined,
      genres: (d.genres ?? []).map((g: { name: string }) => g.name),
      director: crew.filter((c) => c.job === 'Director').map((c) => c.name),
      creators: (d.created_by ?? []).map((c: { name: string }) => c.name),
      cast: [...castList].sort((a, b) => a.order - b.order).slice(0, 5).map((c) => c.name),
      poster_path: d.poster_path ?? undefined,
      logo_path: logo?.file_path,
      releases,
      first_air_date: media_type === 'tv' && d.first_air_date ? String(d.first_air_date) : undefined,
      next_episode: next?.air_date ? { season: next.season_number, episode: next.episode_number, air_date: String(next.air_date) } : undefined,
      status: d.status,
    };
  }

  static posterUrl(path: string, size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500', imageBase = TMDB_IMAGE): string {
    return `${imageBase}/${size}${path}`;
  }
}

/** Release dates in the vault's shape; earliest per kind, premieres dropped. */
export function releaseDatesFor(releases: TmdbRelease[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of releases) {
    if (r.kind === 'premiere') continue;
    if (!out[r.kind] || r.date < out[r.kind]!) out[r.kind] = r.date;
  }
  return out;
}
