import type { VaultIndex, VaultRecord } from '../loaders/index';
import { renderRecord } from './render';
import { urlFor, titleOf } from './urls';
import { feedPosts } from './content';
import identity from '@theme/identity';
import type { Writing, Review } from '@lem/vault-core';

export interface FeedItem { title: string; link: string; pubDate: Date; description: string; content: string; categories: string[] }

export async function feedItem(r: VaultRecord, idx: VaultIndex): Promise<FeedItem> {
  const html = await renderRecord(r, idx);
  const d = r.data as { date?: string; created?: string; tags?: string[] };
  return {
    title: titleOf(r) || html.excerpt.slice(0, 80),
    link: new URL(urlFor(r, idx), identity.site.url).toString(),
    pubDate: new Date(d.date ?? d.created ?? Date.now()),
    description: html.excerpt,
    content: html.html,
    categories: (d.tags ?? []).filter((t) => !t.startsWith('private')),
  };
}

export async function everything(idx: VaultIndex): Promise<FeedItem[]> {
  const recs: VaultRecord[] = [
    ...idx.ofType<Writing>('writing').filter((w) => !identity.writing.rootCollections.includes(w.data.collection)),
    ...feedPosts(idx),
    ...idx.ofType<Review>('review'),
  ];
  const items = await Promise.all(recs.map((r) => feedItem(r, idx)));
  return items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime()).slice(0, 50);
}
