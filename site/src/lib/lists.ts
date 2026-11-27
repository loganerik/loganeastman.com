// Ordinary lists (wishlists, gifts, places) group by the item's category, in the order _config/site.md gives.
import type { VaultIndex } from '../loaders/index';
import type { ResolvedEntry } from './content';

export interface CategoryGroup { key: string; title: string; entries: ResolvedEntry[] }

export function categoryOf(e: ResolvedEntry): string {
  const d = e.item.data as { category?: string; kind?: string };
  if (d.category) return d.category;
  return ({ book: 'Books & Magazines', album: 'Music', film: 'Films', tv: 'Series', place: 'Places', link: 'Links', photo: 'Photos' } as Record<string, string>)[d.kind ?? ''] ?? 'Other';
}

export function groupByCategory(idx: VaultIndex, entries: ResolvedEntry[]): CategoryGroup[] {
  const order = idx.config.site.categories.map((c) => c.key);
  const titles = new Map(idx.config.site.categories.map((c) => [c.key, c.title ?? c.key]));
  const groups = new Map<string, ResolvedEntry[]>();
  for (const e of entries) {
    const k = categoryOf(e);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({ key: k, title: titles.get(k) ?? k, entries: groups.get(k)! }));
}
