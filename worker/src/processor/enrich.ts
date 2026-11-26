// Sourced facts for an item, from the provider that owns its identity. Code only; no model.
import { Tmdb, releaseDatesFor, OpenLibrary, MusicBrainz, type TmdbDetails, type OlBook, type MbAlbum } from '@lem/providers';
import type { Env } from '../env';
import type { ItemKind } from '@lem/vault-core';

export type Identity =
  | { provider: 'tmdb'; external_id: string; media_type: 'movie' | 'tv' }
  | { provider: 'openlibrary'; external_id: string }
  | { provider: 'isbn'; external_id: string }
  | { provider: 'musicbrainz'; external_id: string };

export interface Enriched {
  kind: ItemKind;
  title: string;
  year?: number;
  keys: Record<string, unknown>; // agent-owned frontmatter keys
  identities: Array<{ provider: string; external_id: string }>;
  artwork: { poster?: string; logo?: string; cover?: string }; // provider refs
}

export async function enrich(env: Env, id: Identity, fetchImpl?: typeof fetch): Promise<Enriched> {
  switch (id.provider) {
    case 'tmdb': {
      if (!env.TMDB_TOKEN) throw new Error('TMDB_TOKEN is not set');
      const tmdb = new Tmdb(env.TMDB_TOKEN, fetchImpl, env.TMDB_BASE_URL || undefined, env.TMDB_IMAGE_URL || undefined);
      return fromTmdb(await tmdb.details(Number(id.external_id), id.media_type));
    }
    case 'openlibrary':
    case 'isbn': {
      const ol = new OpenLibrary(fetchImpl, env.OPENLIBRARY_BASE_URL || undefined);
      const b = id.provider === 'isbn' ? await ol.byIsbn(id.external_id) : await ol.byOlid(id.external_id);
      if (!b) throw new Error(`open library: ${id.external_id} not found`);
      return fromOpenLibrary(b);
    }
    case 'musicbrainz': {
      const mb = new MusicBrainz(fetchImpl, env.MUSICBRAINZ_BASE_URL || undefined);
      const a = await mb.releaseGroup(id.external_id);
      if (!a) throw new Error(`musicbrainz: ${id.external_id} not found`);
      return fromMusicBrainz(a);
    }
  }
}

const clean = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

export function fromTmdb(d: TmdbDetails): Enriched {
  const fetched = new Date().toISOString();
  const keys = clean({
    tmdb_id: d.id,
    imdb_id: d.imdb_id,
    director: d.director.length ? d.director : undefined,
    creators: d.creators.length ? d.creators : undefined,
    cast: d.cast.length ? d.cast : undefined,
    synopsis: d.overview || undefined,
    runtime: d.runtime,
    genres: d.genres.length ? d.genres : undefined,
    release_dates: d.media_type === 'movie' && d.releases.length ? releaseDatesFor(d.releases) : undefined,
    first_air_date: d.first_air_date,
    next_episode: d.next_episode,
    sources: { tmdb: { fetched } },
  });
  const identities = [{ provider: 'tmdb', external_id: String(d.id) }];
  if (d.imdb_id) identities.push({ provider: 'imdb', external_id: d.imdb_id });
  return { kind: d.media_type === 'tv' ? 'tv' : 'film', title: d.title, year: d.year, keys, identities, artwork: { poster: d.poster_path ? `tmdb:${d.poster_path}` : undefined, logo: d.logo_path ? `tmdb-logo:${d.logo_path}` : undefined } };
}

export function fromOpenLibrary(b: OlBook): Enriched {
  const keys = clean({ openlibrary_id: b.olid, isbn13: b.isbn13, authors: b.authors.length ? b.authors : undefined, published: b.published, published_year: b.year, publisher: b.publisher, sources: { openlibrary: { fetched: new Date().toISOString() } } });
  const identities = [{ provider: 'openlibrary', external_id: b.olid }];
  if (b.isbn13) identities.push({ provider: 'isbn', external_id: b.isbn13 });
  return { kind: 'book', title: b.title, year: b.year, keys, identities, artwork: { cover: b.cover_id ? `openlibrary:${b.cover_id}` : undefined } };
}

export function fromMusicBrainz(a: MbAlbum): Enriched {
  const keys = clean({ musicbrainz_rg: a.rgid, artist: a.artist, released: a.released, published_year: a.year, sources: { musicbrainz: { fetched: new Date().toISOString() } } });
  return { kind: 'album', title: a.title, year: a.year, keys, identities: [{ provider: 'musicbrainz', external_id: a.rgid }], artwork: { cover: `caa:${a.rgid}` } };
}
