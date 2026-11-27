// Runs after the wall markup. Picks a seed (reused on back/forward so scroll restoration lands), reorders
// the tiles in the DOM (tab order = visual order), and sets each tile's resting angle.
import { arrangeOrder, placementFor } from '../../lib/wall/arrange';
import { splitmix32 } from '../../lib/wall/prng';

const grid = document.querySelector<HTMLElement>('[data-wall]');
if (grid) {
  const nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  const stored = (history.state && history.state.wallSeed) as number | undefined;
  const key = 'wallSeed:' + location.pathname;
  let seed = nav === 'back_forward' ? stored ?? Number(sessionStorage.getItem(key)) : 0;
  if (!seed) seed = (Math.random() * 0xffffffff) >>> 0;
  try { history.replaceState({ ...(history.state ?? {}), wallSeed: seed }, ''); sessionStorage.setItem(key, String(seed)); } catch { /* ignore */ }
  const all = [...grid.querySelectorAll<HTMLElement>('[data-tile]')];
  // picks: keep a random 3–5 per list for this visit, hide the rest
  const rng = splitmix32(seed ^ 0x9e3779b9);
  const min = Number(grid.dataset.picksMin ?? 3), max = Number(grid.dataset.picksMax ?? 5);
  const byList = new Map<string, HTMLElement[]>();
  for (const t of all) if (t.dataset.list) byList.set(t.dataset.list, [...(byList.get(t.dataset.list) ?? []), t]);
  for (const [, picks] of byList) {
    const keep = Math.min(picks.length, min + Math.floor(rng() * (max - min + 1)));
    const shuffled = picks.map((el) => ({ el, k: rng() })).sort((a, b) => a.k - b.k);
    shuffled.forEach(({ el }, i) => { el.hidden = i >= keep; });
  }
  const tiles = all.filter((t) => !t.hidden);
  const order = arrangeOrder(tiles.length, seed, Number(grid.dataset.perturbation ?? 6));
  const frag = document.createDocumentFragment();
  for (const i of order) {
    const t = tiles[i]!;
    const pl = placementFor(t.dataset.tile!, (t.dataset.band as 'text' | 'cover' | 'cutout') ?? 'cover', seed);
    t.style.setProperty('--angle', `${pl.angle}deg`);
    t.style.setProperty('--dx', `${pl.dx}%`);
    t.style.setProperty('--dy', `${pl.dy}%`);
    t.style.setProperty('--s', String(pl.scale));
    frag.appendChild(t);
  }
  const pets = [...grid.querySelectorAll<HTMLElement>('[data-pet-after]')];
  grid.appendChild(frag);
  // pets are spread evenly through the arranged order, with a little jitter
  const visible = [...grid.querySelectorAll<HTMLElement>('[data-tile]')].filter((t) => !t.hidden);
  pets.forEach((p, i) => {
    const pl = placementFor('pet:' + i, 'cutout', seed);
    p.style.setProperty('--angle', `${pl.angle}deg`);
    p.style.setProperty('--dx', `${pl.dx}%`);
    p.style.setProperty('--dy', `${pl.dy}%`);
    const slot = Math.round(((i + 1) * visible.length) / (pets.length + 1) + (rng() - 0.5) * 2);
    const ref = visible[Math.max(0, Math.min(visible.length - 1, slot))];
    if (ref) ref.after(p); else grid.appendChild(p);
  });
  grid.dataset.arranged = String(seed);
}
