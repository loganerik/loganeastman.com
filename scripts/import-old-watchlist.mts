// One-off: bring the old site's to-watch films into the vault as film records + one watchlist per decade.
// Usage: npx tsx scripts/import-old-watchlist.mts [--apply]   (dry run without --apply)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { newId, itemSlug, serializeNote } from '@lem/vault-core';

const OLD = '/Users/logan/Erik/loganeastman/vault/Notes';
const VAULT = '/Users/logan/Erik/website/vault';
const apply = process.argv.includes('--apply');
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

type Old = Record<string, any>;
const notes: Old[] = [];
for (const f of readdirSync(OLD)) {
  if (!f.endsWith('.md')) continue;
  const text = readFileSync(join(OLD, f), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const fm = parseYaml(m[1]) as Old;
  if (fm.type === 'item' && fm.medium === 'film' && fm.status === 'to-watch') notes.push(fm);
}
notes.sort((a, b) => a.year - b.year || String(a.title).localeCompare(String(b.title)));
console.log(`to-watch films: ${notes.length}`);

const tmdbFile = (u?: string) => (u ? u.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+/, '') : undefined);
const decadeOf = (y: number) => `${Math.floor(y / 10) * 10}s`;
const lists = new Map<string, { slug: string; title: string; id: string; films: Array<{ slug: string; added: string }> }>();
const attach: Array<{ slug: string; poster?: string; logo?: string }> = [];
let created = 0, skipped = 0;

for (const n of notes) {
  const dec = decadeOf(Number(n.year));
  const listSlug = `watchlist-${dec}`;
  if (!lists.has(dec)) lists.set(dec, { slug: listSlug, title: `Watchlist ${dec}`, id: newId('list'), films: [] });
  const slug = itemSlug(String(n.title), Number(n.year));
  const path = join(VAULT, 'items/films', `${slug}.md`);
  const added = String(n.date ?? now).slice(0, 10);
  lists.get(dec)!.films.push({ slug, added });
  if (existsSync(path)) { skipped++; continue; }
  const poster = tmdbFile(n.poster);
  const logo = n.titleClippingMethod === 'logo' ? tmdbFile(n.titleClippingSource) : undefined;
  const artwork: Record<string, unknown> = { treatment: n.titleClippingMethod === 'poster' ? 'poster' : 'lettering', poster: poster ? `tmdb:${poster}` : undefined, logo: logo ? `tmdb-logo:${logo}` : undefined };
  const rel: Record<string, string> = {};
  for (const r of (n.releases ?? []) as Array<{ date: string; kind: string; region?: string }>) {
    if (r.region && r.region !== 'US') continue;
    const k = r.kind === 'limited' ? 'theatrical_limited' : r.kind;
    if (['premiere', 'theatrical_limited', 'theatrical', 'digital', 'physical', 'tv'].includes(k) && !rel[k]) rel[k] = String(r.date).slice(0, 10);
  }
  const fm: Record<string, unknown> = {
    id: newId('film'), type: 'item', kind: 'film', title: n.title, year: Number(n.year), visibility: 'public',
    url: n.letterboxdUrl ?? n.url, tmdb_id: n.tmdbId ? Number(n.tmdbId) : undefined,
    director: n.directors, writers: n.writers, cast: n.stars, synopsis: n.synopsis,
    release_dates: Object.keys(rel).length ? rel : undefined,
    artwork, sources: n.tmdbId ? { tmdb: { fetched: String(n.date ?? now) } } : undefined,
    tags: [], related: [], locked: [], created: String(n.date ?? now).length <= 10 ? `${String(n.date)}T12:00:00Z` : n.date,
  };
  attach.push({ slug, poster: poster ? `tmdb:${poster}` : undefined, logo: logo ? `tmdb-logo:${logo}` : undefined });
  if (apply) { mkdirSync(join(VAULT, 'items/films'), { recursive: true }); writeFileSync(path, serializeNote(fm, '')); }
  created++;
}

// the lists and their entries
let entries = 0;
for (const [, l] of lists) {
  const listPath = join(VAULT, 'lists', `${l.slug}.md`);
  if (apply && !existsSync(listPath)) writeFileSync(listPath, serializeNote({ id: l.id, type: 'list', list_type: 'watchlist', title: l.title, visibility: 'public', sort: 'added-desc', created: now }, `Films from the ${l.title.replace('Watchlist ', '')} I mean to see.\n`));
  for (const f of l.films) {
    const ep = join(VAULT, 'lists', l.slug, `${f.slug}.md`);
    if (existsSync(ep)) continue;
    if (apply) { mkdirSync(join(VAULT, 'lists', l.slug), { recursive: true }); writeFileSync(ep, serializeNote({ id: newId('entry'), type: 'list-entry', list: `[[lists/${l.slug}]]`, item: `[[items/films/${f.slug}]]`, added: f.added, state: 'active', visibility: 'public' }, '')); }
    entries++;
  }
}
// the old single watchlist folds into its decade
const oldList = join(VAULT, 'lists/watchlist.md');
if (existsSync(oldList)) {
  for (const f of readdirSync(join(VAULT, 'lists/watchlist'))) {
    const text = readFileSync(join(VAULT, 'lists/watchlist', f), 'utf8');
    const year = Number((text.match(/items\/films\/.*-(\d{4})\]\]/) ?? [])[1]);
    const dec = decadeOf(year || 2020);
    const target = `watchlist-${dec}`;
    console.log(`fold ${f} → ${target}`);
    if (apply) {
      mkdirSync(join(VAULT, 'lists', target), { recursive: true });
      if (!existsSync(join(VAULT, 'lists', target, f))) writeFileSync(join(VAULT, 'lists', target, f), text.replace('[[lists/watchlist]]', `[[lists/${target}]]`));
      rmSync(join(VAULT, 'lists/watchlist', f));
      if (!lists.has(dec)) writeFileSync(join(VAULT, 'lists', `${target}.md`), serializeNote({ id: newId('list'), type: 'list', list_type: 'watchlist', title: `Watchlist ${dec}`, visibility: 'public', sort: 'added-desc', created: now }, `Films from the ${dec} I mean to see.\n`));
    }
  }
  if (apply) { rmSync(join(VAULT, 'lists/watchlist'), { recursive: true, force: true }); rmSync(oldList); }
}
console.log({ created, skipped, entries, lists: [...lists.values()].map((l) => `${l.title} (${l.films.length})`) });
if (apply) writeFileSync('/Users/logan/Erik/website/scripts/.watchlist-attach.json', JSON.stringify(attach, null, 2));
