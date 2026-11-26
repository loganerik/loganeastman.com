// Runs after the wall markup. Picks a seed (reused on back/forward so scroll restoration lands), reorders
// the tiles in the DOM (tab order = visual order), and sets each tile's resting angle.
import { arrangeOrder, angleFor } from '../../lib/wall/arrange';

const grid = document.querySelector<HTMLElement>('[data-wall]');
if (grid) {
  const nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  const stored = (history.state && history.state.wallSeed) as number | undefined;
  const key = 'wallSeed:' + location.pathname;
  let seed = nav === 'back_forward' ? stored ?? Number(sessionStorage.getItem(key)) : 0;
  if (!seed) seed = (Math.random() * 0xffffffff) >>> 0;
  try { history.replaceState({ ...(history.state ?? {}), wallSeed: seed }, ''); sessionStorage.setItem(key, String(seed)); } catch { /* ignore */ }
  const tiles = [...grid.querySelectorAll<HTMLElement>('[data-tile]')];
  const order = arrangeOrder(tiles.length, seed, Number(grid.dataset.perturbation ?? 6));
  const frag = document.createDocumentFragment();
  for (const i of order) {
    const t = tiles[i]!;
    t.style.setProperty('--angle', `${angleFor(t.dataset.tile!, (t.dataset.band as 'text' | 'cover' | 'cutout') ?? 'cover', seed)}deg`);
    frag.appendChild(t);
  }
  const pets = [...grid.querySelectorAll<HTMLElement>('[data-pet-after]')];
  grid.appendChild(frag);
  // pets sit after the nth tile of the arranged order
  for (const p of pets) {
    const after = Number(p.dataset.petAfter);
    const ref = grid.querySelectorAll('[data-tile]')[Math.min(after, tiles.length - 1)];
    if (ref) ref.after(p); else grid.appendChild(p);
  }
  grid.dataset.arranged = String(seed);
}
