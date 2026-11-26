import type { ItemKind } from './schemas.ts';

/** Vault folder per item kind. */
export const ITEM_FOLDERS: Record<ItemKind, string> = {
  film: 'items/films',
  tv: 'items/tv',
  book: 'items/books',
  album: 'items/albums',
  product: 'items/products',
  place: 'items/places',
  link: 'items/links',
  photo: 'items/photos',
};

export function itemPath(kind: ItemKind, slug: string): string {
  return `${ITEM_FOLDERS[kind]}/${slug}.md`;
}
export function listPath(listSlug: string): string {
  return `lists/${listSlug}.md`;
}
export function listEntryPath(listSlug: string, itemSlug: string): string {
  return `lists/${listSlug}/${itemSlug}.md`;
}
export function feedPath(date: string, id: string): string {
  return `feed/${date.slice(0, 4)}/${date.slice(0, 10)}-${id.split('_')[1]}.md`;
}
export function writingPath(collectionPath: string, date: string, slug: string): string {
  return `${collectionPath}/${date.slice(0, 10)}-${slug}.md`;
}
export function reviewPath(date: string, slug: string): string {
  return `reviews/${date.slice(0, 10)}-${slug}.md`;
}

/** Strip `.md` and leading `./` so wikilink targets and paths compare equal. */
export function normalizeTarget(p: string): string {
  return p.replace(/^\.?\//, '').replace(/\.md$/, '');
}
