// Horizon: each film/series once, under its next confirmed US release date. All dates stay on the item page.
import type { VaultIndex } from '../loaders/index';
import type { Rec } from './content';
import type { Item } from '@lem/vault-core';
import { listsContaining } from './content';

export interface HorizonEntry { item: Rec<Item>; date: string; kind: string; why: string }
const ORDER = ['theatrical_limited', 'theatrical', 'digital', 'physical', 'tv'] as const;

export function nextRelease(d: Item, today: string): { date: string; kind: string } | null {
  const cands: Array<{ date: string; kind: string }> = [];
  for (const k of ORDER) {
    const v = d.release_dates?.[k];
    if (typeof v === 'string' && v >= today) cands.push({ date: v, kind: k });
  }
  if (d.kind === 'tv' && d.next_episode?.air_date && d.next_episode.air_date >= today) cands.push({ date: d.next_episode.air_date, kind: 'episode' });
  if (d.kind === 'tv' && d.first_air_date && d.first_air_date >= today) cands.push({ date: d.first_air_date, kind: 'premiere' });
  cands.sort((a, b) => a.date.localeCompare(b.date));
  return cands[0] ?? null;
}

export function horizon(idx: VaultIndex, today: string): Array<{ month: string; entries: HorizonEntry[] }> {
  const kinds = new Set(idx.config.site.horizon.kinds);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + idx.config.site.horizon.window_days);
  const max = limit.toISOString().slice(0, 10);
  const entries: HorizonEntry[] = [];
  for (const item of idx.ofType<Item>('item')) {
    if (!kinds.has(item.data.kind)) continue;
    const n = nextRelease(item.data, today);
    if (!n || n.date > max) continue;
    const why = listsContaining(idx, item).map((e) => e.why).find(Boolean) ?? '';
    entries.push({ item, date: n.date, kind: n.kind, why });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.item.data.title.localeCompare(b.item.data.title));
  const groups = new Map<string, HorizonEntry[]>();
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    groups.set(m, [...(groups.get(m) ?? []), e]);
  }
  return [...groups.entries()].map(([month, entries]) => ({ month, entries }));
}
