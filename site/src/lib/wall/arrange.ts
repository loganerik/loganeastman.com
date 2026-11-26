// Shared by SSR (seed 0) and the client: a gentle, bounded perturbation of the canonical order.
import { splitmix32, hash32 } from './prng';

export function arrangeOrder(n: number, seed: number, perturbation = 6): number[] {
  const rnd = splitmix32(seed);
  const keyed = Array.from({ length: n }, (_, i) => ({ i, k: i + rnd() * perturbation }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((x) => x.i);
}

export function angleFor(id: string, band: 'text' | 'cover' | 'cutout', seed: number): number {
  const max = band === 'text' ? 1.5 : band === 'cover' ? 2 : 3;
  const u = (hash32(id, seed) % 10000) / 10000;
  return Math.round(((u * 2 - 1) * max) / 0.25) * 0.25;
}
