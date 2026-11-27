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
  const arranged = order.map((i) => tiles[i]!);
  for (const t of arranged) {
    const pl = placementFor(t.dataset.tile!, (t.dataset.band as 'text' | 'cover' | 'cutout') ?? 'cover', seed);
    t.style.setProperty('--angle', `${pl.angle}deg`);
    t.style.setProperty('--dx', `${pl.dx}%`);
    t.style.setProperty('--dy', `${pl.dy}%`);
    t.style.setProperty('--s', String(pl.scale));
  }
  // pets: never more than one per `petRatio` content tiles (the wall should not be mostly pets while the pool is small)
  const allPets = [...grid.querySelectorAll<HTMLElement>('[data-pet-after]')];
  const petRatio = Number(grid.dataset.petRatio ?? 3);
  const petCount = Math.min(allPets.length, Math.max(1, Math.round(arranged.length / petRatio)));
  const pets = allPets.map((el) => ({ el, k: rng() })).sort((a, b) => a.k - b.k).map((p) => p.el);
  pets.forEach((p, i) => {
    p.hidden = i >= petCount;
    const pl = placementFor('pet:' + i, 'cutout', seed);
    p.style.setProperty('--angle', `${pl.angle}deg`);
    p.style.setProperty('--dx', `${pl.dx}%`);
    p.style.setProperty('--dy', `${pl.dy}%`);
  });
  // one sequence: pets spread evenly through the arranged tiles, with a little jitter
  const seq: HTMLElement[] = [...arranged];
  pets.slice(0, petCount).forEach((p, i) => {
    const slot = Math.round(((i + 1) * arranged.length) / (petCount + 1) + (rng() - 0.5) * 2) + i;
    seq.splice(Math.max(0, Math.min(seq.length, slot)), 0, p);
  });
  // variety: no two tiles of the same family side by side, nor (roughly) one above the other
  const family = (el: HTMLElement): string => {
    if (el.dataset.petAfter !== undefined) return 'pet';
    const c = el.querySelector('.clip');
    if (!c) return 'text';
    if (c.classList.contains('clip--shape')) return el.classList.contains('tile--queue') ? 'seal' : 'text';
    if (c.classList.contains('clip--typeset')) return 'typeset';
    if (c.classList.contains('clip--cover') || c.classList.contains('clip--lettering') || c.classList.contains('clip--poster')) return 'cover';
    return 'cutout';
  };
  const cols = Number(getComputedStyle(grid).getPropertyValue('--cols')) || 2;
  const fam = seq.map(family);
  const clash = (i: number, f: string) => (i > 0 && fam[i - 1] === f) || (i >= cols && fam[i - cols] === f);
  const swap = (i: number, j: number) => { [seq[i], seq[j]] = [seq[j]!, seq[i]!]; [fam[i], fam[j]] = [fam[j]!, fam[i]!]; };
  const fits = (pos: number, f: string, except: number) => [pos - 1, pos + 1, pos - cols, pos + cols].every((n) => n < 0 || n >= fam.length || n === except || fam[n] !== f);
  for (let i = 1; i < seq.length; i++) {
    if (!clash(i, fam[i]!)) continue;
    let done = false;
    for (let j = i + 1; j < Math.min(seq.length, i + 8) && !done; j++) if (!clash(i, fam[j]!)) { swap(i, j); done = true; }
    // nothing suitable ahead (end of the wall): trade with an earlier tile that fits here, where this one also fits there
    for (let j = i - 2; j > 0 && !done; j--) if (fam[j] !== fam[i] && fits(i, fam[j]!, j) && fits(j, fam[i]!, i)) { swap(i, j); done = true; }
  }
  const frag = document.createDocumentFragment();
  for (const el of seq) frag.appendChild(el);
  for (const p of pets.slice(petCount)) frag.appendChild(p);
  grid.appendChild(frag);
  grid.dataset.arranged = String(seed);
}
