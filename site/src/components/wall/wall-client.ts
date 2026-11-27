// Runs after the wall markup. Takes stock of what the build baked, keeps a seeded random 3–5 things per list for
// this visit, then DEALS the tiles so neighbours differ (never two of a kind side by side when it can be helped, and
// never two from the same list), with a pet between every couple of tiles. The seed is reused on back/forward so
// scroll restoration lands. Tab order = visual order.
import { placementFor } from '../../lib/wall/arrange';
import { splitmix32 } from '../../lib/wall/prng';

const grid = document.querySelector<HTMLElement>('[data-wall]');
if (grid) {
  const nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  const stored = (history.state && history.state.wallSeed) as number | undefined;
  const key = 'wallSeed:' + location.pathname;
  let seed = nav === 'back_forward' ? stored ?? Number(sessionStorage.getItem(key)) : 0;
  if (!seed) seed = (Math.random() * 0xffffffff) >>> 0;
  try { history.replaceState({ ...(history.state ?? {}), wallSeed: seed }, ''); sessionStorage.setItem(key, String(seed)); } catch { /* ignore */ }
  const rng = splitmix32(seed ^ 0x9e3779b9);
  const all = [...grid.querySelectorAll<HTMLElement>('[data-tile]')];

  // 1. stock: a random 3–5 per list for this visit; everything else baked stays
  const min = Number(grid.dataset.picksMin ?? 3), max = Number(grid.dataset.picksMax ?? 5);
  const byList = new Map<string, HTMLElement[]>();
  for (const t of all) if (t.dataset.list) byList.set(t.dataset.list, [...(byList.get(t.dataset.list) ?? []), t]);
  for (const [, picks] of byList) {
    const keep = Math.min(picks.length, min + Math.floor(rng() * (max - min + 1)));
    picks.map((el) => ({ el, k: rng() })).sort((a, b) => a.k - b.k).forEach(({ el }, i) => { el.hidden = i >= keep; });
  }
  const tiles = all.filter((t) => !t.hidden);

  // 2. what kind of thing each tile is, for the dealing
  const family = (el: HTMLElement): string => {
    if (el.dataset.petAfter !== undefined) return 'pet';
    const c = el.querySelector('.clip');
    if (!c) return 'text';
    if (c.classList.contains('clip--shape')) return el.classList.contains('tile--queue') ? 'seal' : el.classList.contains('tile--piece') ? 'piece' : 'text';
    if (c.classList.contains('clip--typeset')) return 'typeset';
    if (c.classList.contains('clip--cover') || c.classList.contains('clip--poster') || c.classList.contains('clip--logo')) return 'cover';
    return 'cutout';
  };
  // buckets: family + list, so posters from one watchlist spread out instead of clustering
  type Bucket = { key: string; fam: string; items: HTMLElement[] };
  const buckets = new Map<string, Bucket>();
  for (const t of tiles) {
    const fam = family(t);
    const k = fam + ':' + (t.dataset.list ?? '');
    if (!buckets.has(k)) buckets.set(k, { key: k, fam, items: [] });
    buckets.get(k)!.items.push(t);
  }
  for (const b of buckets.values()) b.items = b.items.map((el) => ({ el, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.el);

  // 3. deal: from whichever bucket has the most left, preferring one whose family and list differ from the last two
  const cols = Number(getComputedStyle(grid).getPropertyValue('--cols')) || 2;
  const dealt: HTMLElement[] = [];
  const famOf: string[] = [];
  const keyOf: string[] = [];
  const total = tiles.length;
  while (dealt.length < total) {
    const live = [...buckets.values()].filter((b) => b.items.length);
    const prevF = famOf[famOf.length - 1], prevK = keyOf[keyOf.length - 1], aboveF = famOf[famOf.length - cols];
    const score = (b: Bucket) => b.items.length + (b.key !== prevK ? 2 : 0) + (b.fam !== prevF ? 3 : 0) + (b.fam !== aboveF ? 1 : 0) + rng() * 0.5;
    live.sort((a, b) => score(b) - score(a));
    const pick = live[0]!;
    const el = pick.items.pop()!;
    dealt.push(el); famOf.push(pick.fam); keyOf.push(pick.key);
  }
  for (const t of dealt) {
    const pl = placementFor(t.dataset.tile!, (t.dataset.band as 'text' | 'cover' | 'cutout') ?? 'cover', seed);
    t.style.setProperty('--angle', `${pl.angle}deg`);
    t.style.setProperty('--dx', `${pl.dx}%`);
    t.style.setProperty('--dy', `${pl.dy}%`);
  }

  // 4. pets: one for every `petRatio` tiles, cycling through the poses (cloned when the wall outgrows them), spread evenly
  const poses = [...grid.querySelectorAll<HTMLElement>('[data-pet-after]')];
  const petRatio = Number(grid.dataset.petRatio ?? 2);
  const petCount = poses.length ? Math.min(Math.max(1, Math.round(dealt.length / petRatio)), dealt.length) : 0;
  const order = poses.map((el) => ({ el, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.el);
  const pets: HTMLElement[] = [];
  for (let i = 0; i < petCount; i++) {
    const src = order[i % order.length]!;
    const el = i < order.length ? src : (src.cloneNode(true) as HTMLElement);
    const pl = placementFor('pet:' + i + ':' + seed, 'cutout', seed);
    el.hidden = false;
    el.style.setProperty('--angle', `${pl.angle}deg`);
    el.style.setProperty('--dx', `${pl.dx}%`);
    el.style.setProperty('--dy', `${pl.dy}%`);
    el.dataset.side = i % 2 ? 'left' : 'right';
    pets.push(el);
  }
  const seq: HTMLElement[] = [...dealt];
  pets.forEach((p, i) => {
    const slot = Math.round(((i + 1) * dealt.length) / (petCount + 1) + (rng() - 0.5) * 2) + i;
    seq.splice(Math.max(0, Math.min(seq.length, slot)), 0, p);
  });
  // a pet never sits beside a pet
  for (let i = 1; i < seq.length; i++) {
    if (seq[i]!.dataset.petAfter === undefined || seq[i - 1]!.dataset.petAfter === undefined) continue;
    for (let j = i + 1; j < seq.length; j++) if (seq[j]!.dataset.petAfter === undefined) { [seq[i], seq[j]] = [seq[j]!, seq[i]!]; break; }
  }
  const frag = document.createDocumentFragment();
  for (const el of seq) frag.appendChild(el);
  for (const p of poses) if (!pets.includes(p)) { p.hidden = true; frag.appendChild(p); }
  grid.appendChild(frag);
  grid.dataset.arranged = String(seed);
}
