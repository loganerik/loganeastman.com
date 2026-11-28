// Who gets on the wall: photos with clips, writing, recent thoughts, a seal for every list plus a rotating dozen
// of its things, reviews whose subject is finished. Scored by weight × recency; quotas per kind. The client deals
// the final order per visit (wall-client.ts).
import { starText } from '../stars';
import type { VaultIndex, VaultRecord } from '../../loaders/index';
import type { Item, List, Feed, Writing, Review } from '@lem/vault-core';
import { entriesOf, listType, type Rec, type ResolvedEntry } from '../content';
import { urlFor, titleOf } from '../urls';
import { fmtDate } from '../dates';
import identity from '@theme/identity';
import { splitmix32, hash32 } from './prng';

export type TileKind = 'photo' | 'piece' | 'thought' | 'pick' | 'queue' | 'review' | 'gift';
export interface WallTile {
  id: string;
  kind: TileKind;
  href: string;
  title: string;
  caption: string;
  record: VaultRecord; // artwork source (item / piece / list / post)
  shape?: 'slip' | 'seal' | 'arch' | 'stepped';
  tone?: 'pink' | 'green' | 'ink'; // seals and slips
  attached?: VaultRecord; // a thought's linked thing, shown small above the words
  picks?: VaultRecord[]; // a list's things peeking out of its arch or strip
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
  if (kind === 'queue') return { c: 1, r: 1 };
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
    // a post with a title and no body (older captures) shows its title; one with neither has nothing to show
    const text = (p.body.replace(/[#>*_`\[\]!]/g, '').replace(/\s+/g, ' ').trim() || String(p.data.title ?? '').trim());
    const hasArt = !!(p.data.artwork?.clip || p.data.artwork?.thumb);
    if (!text && !hasArt) continue;
    const words = text.split(' ').length;
    const ab = p.data.about ? idx.resolve(p.data.about) : undefined;
    const attached = ab?.public && ab.type === 'item' && ((ab.data as Item).artwork?.clip || (ab.data as Item).artwork?.thumb) ? ab : undefined;
    push({ attached, id: p.data.id, kind: hasArt ? 'photo' : 'thought', href: urlFor(p, idx), title: p.data.title ?? text.slice(0, 60), caption: String(p.data.date).length > 10 ? fmtDate(p.data.date, { month: 'short', day: 'numeric' }) + ' · ' + fmtDate(p.data.date, { hour: 'numeric', minute: '2-digit' }) : fmtDate(p.data.date), record: p, shape: hasArt ? undefined : words <= 6 ? 'stepped' : 'slip', text: text.length > 140 ? text.slice(0, 137).trimEnd() + '…' : text, words, score: 0.9 * recency(p.data.date, 30) });
  }
  // lists: every list is on the wall in one of four forms (seal, arch, stepped frame, slip), chosen by the list's
  // own `form`, else its type's, else dealt round-robin so lists of one type never all look alike; and every list
  // lends a few of its things: a daily-rotating dozen are baked, the client shows 3–5 per visit
  const allLists = idx.ofType<List>('list');
  const forms = identity.wall.listForms;
  const rankWithin = new Map<string, number>();
  for (const l of [...allLists].sort((a, b) => String(a.data.created ?? '').localeCompare(String(b.data.created ?? '')))) {
    const n = rankWithin.get(l.data.list_type) ?? 0; rankWithin.set(l.data.list_type, n + 1); rankWithin.set(`${l.data.list_type}:${l.data.id}`, n);
  }
  for (const l of allLists) {
    const lt = listType(idx, l.data.list_type);
    const entries = entriesOf(idx, l as Rec<List>);
    const active = entries.filter((e) => e.entry.data.state !== 'done');
    const day = Math.floor(Date.now() / DAY);
    const rnd = splitmix32(hash32(l.data.id, day));
    const baked = active.map((e) => ({ e, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, identity.wall.bakePerList).map((x) => x.e);
    const form = ((l.data as { form?: string }).form ?? (lt as { form?: string } | undefined)?.form ?? forms[((rankWithin.get(`${l.data.list_type}:${l.data.id}`) ?? 0) + (hash32(l.data.list_type) % forms.length)) % forms.length]) as WallTile['shape'];
    const tone: WallTile['tone'] = form === 'slip' ? 'ink' : hash32(l.data.id) & 1 ? 'pink' : 'green';
    const hasArt = (e: ResolvedEntry) => { const a = (e.item.data as { artwork?: { clip?: string; thumb?: string; full?: string } }).artwork; return !!(a?.clip || a?.thumb || a?.full); };
    const picks = baked.filter(hasArt).slice(0, 3).map((e) => e.item as VaultRecord);
    if (entries.length) push({ id: l.data.id, kind: 'queue', href: urlFor(l, idx), title: l.data.title, caption: lt?.title ?? 'List', record: l, shape: form, tone, picks, count: entries.length, score: 0.75 * recency(entries[0]?.entry.data.finished ?? entries[0]?.entry.data.added) });
    for (const e of baked) {
      const isGift = lt?.key === 'gifts';
      push({ id: e.entry.data.id, kind: isGift ? 'gift' : 'pick', href: urlFor(e.item, idx), title: e.item.data.title, caption: isGift ? 'Gift idea' : `from ${l.data.title}`, record: e.item, listId: l.data.id, score: 0.8 * (0.5 + 0.5 * recency(e.entry.data.added)) });
    }
  }
  // reviews of finished subjects
  for (const rv of idx.ofType<Review>('review')) {
    const item = idx.resolve(rv.data.item) as Rec<Item> | undefined;
    if (!item?.public) continue;
    const finished = !!item.data.finished || idx.ofType('list-entry', { all: true }).some((e) => (e.data as { item: string; state: string }).state === 'done' && idx.resolve((e.data as { item: string }).item)?.path === item.path);
    if (!finished) continue;
    push({ id: rv.data.id, kind: 'review', href: urlFor(rv, idx), title: rv.data.title ?? `On ${item.data.title}`, caption: [starText(rv.data.rating, idx.config.site.rating_scale) + ((rv.data as { liked?: boolean }).liked ? ' ♥' : ''), fmtDate(rv.data.date)].map((x) => x.trim()).filter(Boolean).join(' · ') || 'Review', record: item, shape: 'stepped', score: 1.0 * recency(rv.data.date) });
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
