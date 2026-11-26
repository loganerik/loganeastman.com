import identity from '@theme/identity';
import type { VaultRecord, VaultIndex } from '../loaders/index';
import type { ItemKind, Item, Writing, Review, Feed, List, ListEntry, Person, Tag } from '@lem/vault-core';
import { slugify } from '@lem/vault-core';

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

export function kindRoute(kind: ItemKind): string {
  return identity.kinds[kind]?.route ?? kind;
}

/** Public URL slug for a record (writing/review: `slug:` key wins, else filename minus date prefix). */
export function slugOf(r: VaultRecord): string {
  const d = r.data as { slug?: string };
  if (d.slug) return d.slug;
  if (r.type === 'writing' || r.type === 'review') return r.stem.replace(DATE_PREFIX, '');
  return r.stem;
}

export function urlFor(r: VaultRecord, index?: VaultIndex): string {
  switch (r.type) {
    case 'item':
      return `/${kindRoute((r.data as Item).kind)}/${r.stem}/`;
    case 'list':
      return `/lists/${r.stem}/`;
    case 'list-entry': {
      const item = index?.resolve((r.data as ListEntry).item);
      return item ? urlFor(item, index) : `/lists/`;
    }
    case 'writing': {
      const c = (r.data as Writing).collection;
      if (identity.writing.rootCollections.includes(c)) return `/${slugOf(r)}/`;
      return `/writing/${c}/${slugOf(r)}/`;
    }
    case 'feed':
      return `/feed/${r.stem}/`;
    case 'review':
      return `/reviews/${slugOf(r)}/`;
    case 'person':
      return `/people/${r.stem}/`;
    case 'tag':
      return `/tags/${slugify((r.data as Tag).name) || r.stem}/`;
    default:
      return '/';
  }
}

export function tagUrl(tag: string): string {
  return `/tags/${slugify(tag)}/`;
}

export function titleOf(r: VaultRecord): string {
  const d = r.data as { title?: string; name?: string };
  return d.title ?? d.name ?? r.stem;
}

export type { Item, Writing, Review, Feed, List, ListEntry, Person, Tag };
