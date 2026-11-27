// Who gets on the wall: photos with clips, writing, recent thoughts, up to three picks per ordinary list,
// one seal per media queue, reviews whose subject is finished. Scored by weight × recency; quotas per kind.
import type { VaultIndex, VaultRecord } from '../../loaders/index';
import type { Item, List, Feed, Writing, Review } from '@lem/vault-core';
import { entriesOf, listType, type Rec } from '../content';
import { urlFor, titleOf } from '../urls';
import { fmtDate } from '../dates';
import identity from '@theme/identity';

export type TileKind = 'photo' | 'piece' | 'thought' | 'pick' | 'queue' | 'review' | 'gift';
export interface WallTile {
  id: string;
  kind: TileKind;
  href: string;
  title: string;
  caption: string;
  record: VaultRecord; // artwork source (item / piece / list / post)
  shape?: 'slip' | 'seal' | 'arch' | 'stepped';
  text?: string; // for thoughts
  count?: number; // for queues
  span: { c: 1 | 2 | 3; r: 1 | 2 };
  band: 'text' | 'cover' | 'cutout';
  score: number;
  words?: number;
  listId?: string; // picks: which list they came from (the client keeps 3–5 per list per visit)
}

const DAY = 86_400_000;
function recency(date: string | undefined, half = 90): number {
  if (!date) return 0.3;
  const age = (Date.now() - new Date(date).getTime()) / DAY;
  return Math.exp(-Math.max(0, age) / half);
}

function spanFor(kind: TileKind, r: VaultRecord, words = 0, hero = false): WallTile['span'] {
  if (hero) return { c: 2, r: 2 };
  if (kind === 'thought') return words <= 10 ? { c: 1, r: 1 } : { c: 2, r: 1 };
  if (kind === 'piece' && !(r.data as { artwork?: unknown }).artwork) return { c: 1, r: 1 };
  return { c: 1, r: 1 };
}

function bandFor(kind: TileKind, r: VaultRecord): WallTile['band'] {
  const t = (r.data as { artwork?: { treatment?: string }; kind?: string }).artwork?.treatment ?? (r.type === 'item' ? identity.kinds[(r.data as Item).kind]?.treatment : 'typeset');
  if (kind === 'thought' || kind === 'queue' || (kind === 'piece' && !(r.data as Writing).artwork)) return 'text';
  if (t === 'cutout' || t === 'paper') return 'cutout';
  return 'cover';
}

export function wallCandidates(idx: VaultIndex): WallTile[] {
  const tiles: WallTile[] = [];
  const quotas = identity.wall.quotas;
  const push = (t: Omit<WallTile, 'span' | 'band'> & { hero?: boolean }) => tiles.push({ ...t, span: spanFor(t.kind, t.record, t.words, t.hero), band: bandFor(t.kind, t.record) });

  // photos
  for (const it of idx.ofType<Item>('item').filter((i) => i.data.kind === 'photo' && i.data.approved && (i.data.artwork?.clip || i.data.artwork?.thumb)))
    push({ id: it.data.id, kind: 'photo', href: urlFor(it, idx), title: it.data.title, caption: fmtDate(it.data.taken ?? it.data.created), record: it, score: 1.0 * recency(it.data.taken ?? it.data.created) });
  // writing (not root pages)
  for (const w of idx.ofType<Writing>('writing').filter((w) => !identity.writing.rootCollections.includes(w.data.collection))) {
    const coll = idx.config.collections.find((c) => c.key === w.data.collection);
    push({ id: w.data.id, kind: 'piece', href: urlFor(w, idx), title: w.data.title, caption: `${coll?.title ?? w.data.collection} · ${fmtDate(w.data.date)}`, record: w, shape: coll?.form === 'stepped' ? 'stepped' : 'arch', score: 1.1 * recency(w.data.date) });
  }
  // thoughts
  for (const p of idx.ofType<Feed>('feed').sort((a, b) => String(b.data.date).localeCompare(String(a.data.date))).slice(0, 20)) {
    const text = p.body.replace(/[#>*_`\[\]!]/g, '').replace(/\s+/g, ' ').trim();
    const words = text.split(' ').length;
    const hasArt = !!(p.data.artwork?.clip || p.data.artwork?.thumb);
    push({ id: p.data.id, kind: hasArt ? 'photo' : 'thought', href: urlFor(p, idx), title: p.data.title ?? text.slice(0, 60), caption: fmtDate(p.data.date), record: p, shape: hasArt ? undefined : words <= 6 ? 'stepped' : 'slip', text: text.length > 140 ? text.slice(0, 137).trimEnd() + '…' : text, words, score: 0.9 * recency(p.data.date, 30) });
  }
  // lists
  for (const l of idx.ofType<List>('list')) {
    const lt = listType(idx, l.data.list_type);
    const entries = entriesOf(idx, l as Rec<List>);
    // every list is on the wall as a seal; ordinary lists also contribute picks (the client shows 3–5 of up to 8 per visit)
    if (entries.length) push({ id: l.data.id, kind: 'queue', href: urlFor(l, idx), title: l.data.title, caption: `${lt?.title ?? 'List'} · ${entries.length}`, record: l, shape: 'seal', count: entries.length, score: 0.75 * recency(entries[0]?.entry.data.added) });
    if (!lt?.queue) {
      for (const e of entries.slice(0, 8)) {
        const isGift = lt?.key === 'gifts';
        push({ id: e.entry.data.id, kind: isGift ? 'gift' : 'pick', href: urlFor(e.item, idx), title: e.item.data.title, caption: isGift ? 'Gift idea' : `from ${l.data.title}`, record: e.item, listId: l.data.id, score: 0.8 * recency(e.entry.data.added) });
      }
    }
  }
  // reviews of finished subjects
  for (const rv of idx.ofType<Review>('review')) {
    const item = idx.resolve(rv.data.item) as Rec<Item> | undefined;
    if (!item?.public) continue;
    const finished = !!item.data.finished || idx.ofType('list-entry', { all: true }).some((e) => (e.data as { item: string; state: string }).state === 'done' && idx.resolve((e.data as { item: string }).item)?.path === item.path);
    if (!finished) continue;
    push({ id: rv.data.id, kind: 'review', href: urlFor(rv, idx), title: rv.data.title ?? `On ${item.data.title}`, caption: `Review · ${fmtDate(rv.data.date)}`, record: item, shape: 'stepped', score: 1.0 * recency(rv.data.date) });
  }

  // quotas, then global order by score; the two best photos become heroes
  const byKind = new Map<TileKind, WallTile[]>();
  for (const t of tiles) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t]);
  const picked: WallTile[] = [];
  for (const [k, list] of byKind) picked.push(...list.sort((a, b) => b.score - a.score).slice(0, quotas[k] ?? 6));
  picked.sort((a, b) => b.score - a.score);
  let heroes = 0;
  for (const t of picked) if (t.kind === 'photo' && heroes < 1) { t.span = { c: 2, r: 2 }; heroes++; }
  return picked.slice(0, identity.wall.maxTiles);
}

export { titleOf };
