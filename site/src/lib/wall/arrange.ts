// Shared by SSR (seed 0) and the client: a gentle, bounded perturbation of the canonical order.
import { splitmix32, hash32 } from './prng';

export function arrangeOrder(n: number, seed: number, perturbation = 14): number[] {
  const rnd = splitmix32(seed);
  const keyed = Array.from({ length: n }, (_, i) => ({ i, k: i + rnd() * perturbation }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((x) => x.i);
}

export function angleFor(id: string, band: 'text' | 'cover' | 'cutout', seed: number): number {
  const max = band === 'text' ? 4 : band === 'cover' ? 6 : 9;
  const u = (hash32(id, seed) % 10000) / 10000;
  return Math.round(((u * 2 - 1) * max) / 0.25) * 0.25;
}

/** Scrapbook placement: a drift off the cell centre, a size wobble, and the resting angle. Deterministic per id+seed. */
export function placementFor(id: string, band: 'text' | 'cover' | 'cutout', seed: number): { dx: number; dy: number; scale: number; angle: number } {
  const r = splitmix32(hash32(id, seed ^ 0x5bd1e995));
  const amp = band === 'text' ? 10 : 16; // percent of the cell
  return {
    dx: Math.round((r() * 2 - 1) * amp),
    dy: Math.round((r() * 2 - 1) * amp),
    scale: Math.round((0.78 + r() * 0.3) * 100) / 100,
    angle: angleFor(id, band, seed),
  };
}
