// The single artwork-treatment switch. Every view asks this for how to draw a record's clipping so the
// same film/book/thing is recognizable on the wall, in a list, on its page, and on Horizon.
import identity from '@theme/identity';
import type { VaultRecord } from '../loaders/index';
import type { Item, Artwork, Treatment } from '@lem/vault-core';
import { titleOf } from './urls';

export type ClipContext = 'wall' | 'list' | 'page' | 'horizon' | 'og';
export type ClipMode = 'cutout' | 'paper' | 'cover' | 'poster' | 'logo' | 'typeset';
export interface ClipSpec {
  mode: ClipMode;
  src?: string;
  width?: number;
  height?: number;
  alt: string;
  title: string;
  kicker?: string;
  /** aspect ratio w/h to reserve */
  ar: number;
  tone: 'paper' | 'dark';
}

function treatmentFor(r: VaultRecord): Treatment {
  const art = (r.data as { artwork?: Artwork }).artwork;
  const kind = r.type === 'item' ? (r.data as Item).kind : undefined;
  // covers and title art are shown whole: a cutout treatment on these kinds is ignored unless a clip exists and was asked for
  if (kind === 'book' || kind === 'album') return art?.treatment === 'cutout' && art.clip ? 'cutout' : 'cover';
  if (kind === 'film' || kind === 'tv') return art?.treatment === 'poster' ? 'poster' : 'lettering';
  if (art?.treatment) return art.treatment;
  if (r.type === 'item') return (identity.kinds[(r.data as Item).kind]?.treatment ?? 'typeset') as Treatment;
  return 'typeset';
}

export function kickerFor(r: VaultRecord): string | undefined {
  if (r.type === 'item') {
    const d = r.data as Item;
    const label = identity.kinds[d.kind]?.label ?? d.kind;
    return d.year ? `${label} · ${d.year}` : label;
  }
  return undefined;
}

export function clipFor(r: VaultRecord, context: ClipContext, opts: { tone?: 'paper' | 'dark' } = {}): ClipSpec {
  const title = titleOf(r);
  const art = (r.data as { artwork?: Artwork }).artwork ?? {};
  const tone = opts.tone ?? 'paper';
  const kicker = kickerFor(r);
  const t = treatmentFor(r);
  const typeset = (ar = 1): ClipSpec => ({ mode: 'typeset', alt: '', title, kicker, ar, tone });
  const pic = (mode: ClipMode, src?: string, size?: [number, number], fallbackAr = 1): ClipSpec =>
    src ? { mode, src, width: size?.[0], height: size?.[1], alt: art.alt ?? title, title, kicker, ar: size ? size[0] / size[1] : fallbackAr, tone } : typeset(fallbackAr);

  switch (t) {
    case 'lettering':
    case 'logo': {
      // official transparent title treatment when we have one, else typeset; full poster only inside queue lists
      if (context === 'list' && (art.thumb || art.full)) return pic('poster', art.thumb ?? art.full, art.thumb_size ?? art.full_size, 2 / 3);
      if (art.clip) return pic('logo', art.clip, art.clip_size, 1.6);
      return typeset(context === 'horizon' ? 2.2 : 1.4);
    }
    case 'poster':
      return pic('poster', context === 'page' ? art.full ?? art.thumb : art.thumb ?? art.full, context === 'page' ? art.full_size ?? art.thumb_size : art.thumb_size ?? art.full_size, 2 / 3);
    case 'cover':
      if (art.clip) return pic('cover', art.clip, art.clip_size, 2 / 3); // a trimmed cover (white margins cropped)
      return pic('cover', context === 'page' ? art.full ?? art.thumb : art.thumb ?? art.full, context === 'page' ? art.full_size ?? art.thumb_size : art.thumb_size ?? art.full_size, 2 / 3);
    case 'cutout':
      if (art.clip) return pic('cutout', art.clip, art.clip_size, 1);
      if (art.thumb) return pic('paper', art.thumb, art.thumb_size, 4 / 3);
      return typeset(1);
    case 'paper':
      return pic('paper', context === 'page' ? art.full ?? art.thumb : art.thumb ?? art.full, context === 'page' ? art.full_size ?? art.thumb_size : art.thumb_size ?? art.full_size, 4 / 3);
    case 'none':
    case 'typeset':
    default:
      return typeset(1.4);
  }
}

/** Seeded, slightly irregular polygon for the cut-paper edge. Deterministic per id. */
export function paperEdgePath(seed: string, points = 14, jitter = 1.5): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 4294967296;
  const pts: string[] = [];
  const perSide = Math.max(2, Math.floor(points / 4));
  const j = () => (rnd() * 2 - 1) * jitter;
  for (let i = 0; i < perSide; i++) pts.push(`${(i / perSide) * 100 + j()}% ${j()}%`);
  for (let i = 0; i < perSide; i++) pts.push(`${100 + j()}% ${(i / perSide) * 100 + j()}%`);
  for (let i = 0; i < perSide; i++) pts.push(`${100 - (i / perSide) * 100 + j()}% ${100 + j()}%`);
  for (let i = 0; i < perSide; i++) pts.push(`${j()}% ${100 - (i / perSide) * 100 + j()}%`);
  return `polygon(${pts.join(', ')})`;
}

/** Resting angle in degrees, deterministic per id, band-limited. */
export function restingAngle(id: string, band: 'text' | 'cover' | 'cutout' = 'cover', seed = 0): number {
  const max = band === 'text' ? 1.5 : band === 'cover' ? 2 : 3;
  let h = 2166136261 ^ seed;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const u = ((h >>> 0) % 10000) / 10000;
  return Math.round(((u * 2 - 1) * max) / 0.25) * 0.25;
}

export function lengthClass(title: string): 'short' | 'medium' | 'long' {
  const n = title.length;
  return n <= 12 ? 'short' : n <= 28 ? 'medium' : 'long';
}
