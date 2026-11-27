// Typed helpers over the index for pages.
import { getIndex, type VaultIndex, type VaultRecord } from '../loaders/index';
import type { Item, List, ListEntry, Writing, Feed, Review, ListTypeDef, CollectionDef } from '@lem/vault-core';
import { entryIsPublic } from '@lem/vault-core';
import { urlFor } from './urls';

export type Rec<T> = VaultRecord & { data: T };

export async function index(): Promise<VaultIndex> {
  return getIndex();
}

export function listType(idx: VaultIndex, key: string): ListTypeDef | undefined {
  return idx.config.listTypes.find((t) => t.key === key);
}
export function collectionDef(idx: VaultIndex, key: string): CollectionDef | undefined {
  return idx.config.collections.find((c) => c.key === key);
}

export interface ResolvedEntry {
  entry: Rec<ListEntry>;
  item: Rec<Item>;
  list: Rec<List>;
  why: string; // body of the entry, trimmed
}

/** Public entries of a list, newest first, each with its resolved item. */
export function entriesOf(idx: VaultIndex, list: Rec<List>): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const e of idx.ofType<ListEntry>('list-entry', { all: true })) {
    const l = idx.resolve(e.data.list);
    if (!l || l.path !== list.path) continue;
    const item = idx.resolve(e.data.item) as Rec<Item> | undefined;
    if (!item || item.type !== 'item') continue;
    if (!entryIsPublic(e.data, list.data, item.data)) continue;
    out.push({ entry: e as Rec<ListEntry>, item, list, why: e.body.trim() });
  }
  const sort = list.data.sort;
  out.sort((a, b) =>
    sort === 'title' ? a.item.data.title.localeCompare(b.item.data.title)
    : sort === 'manual' ? (a.entry.data.order ?? 0) - (b.entry.data.order ?? 0)
    : sort === 'added-asc' ? a.entry.data.added.localeCompare(b.entry.data.added)
    : sort === 'finished-desc' ? String(b.entry.data.finished ?? b.entry.data.added).localeCompare(String(a.entry.data.finished ?? a.entry.data.added))
    : b.entry.data.added.localeCompare(a.entry.data.added),
  );
  return out;
}

/** Every public list entry that points at this item (so an item page can say "On Watchlist"). */
export function listsContaining(idx: VaultIndex, item: Rec<Item>): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const e of idx.ofType<ListEntry>('list-entry', { all: true })) {
    const it = idx.resolve(e.data.item);
    if (!it || it.path !== item.path) continue;
    const list = idx.resolve(e.data.list) as Rec<List> | undefined;
    if (!list || !entryIsPublic(e.data, list.data, item.data)) continue;
    out.push({ entry: e as Rec<ListEntry>, item, list, why: e.body.trim() });
  }
  return out;
}

export function reviewsOf(idx: VaultIndex, item: Rec<Item>): Rec<Review>[] {
  return idx.ofType<Review>('review').filter((r) => idx.resolve(r.data.item)?.path === item.path);
}

export function byDateDesc<T extends { date: string }>(a: Rec<T>, b: Rec<T>): number {
  return String(b.data.date).localeCompare(String(a.data.date));
}

export function writingIn(idx: VaultIndex, collection: string): Rec<Writing>[] {
  return idx.ofType<Writing>('writing').filter((w) => w.data.collection === collection).sort(byDateDesc);
}
export function feedPosts(idx: VaultIndex): Rec<Feed>[] {
  return idx.ofType<Feed>('feed').sort(byDateDesc);
}

export { urlFor };
