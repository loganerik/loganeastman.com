import { z } from 'zod';
import { parseWikilink } from './wikilink.ts';

// ---------- primitives ----------
const dateish = z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString() : v));
export const isoDate = dateish.pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected YYYY-MM-DD…'));
export const ref = z.string().refine((s) => parseWikilink(s) !== null, 'expected a [[wikilink]]');
export const visibility = z.enum(['public', 'private']);
export const ITEM_KINDS = ['film', 'tv', 'book', 'album', 'product', 'place', 'link', 'photo'] as const;
export const itemKind = z.enum(ITEM_KINDS);
export type ItemKind = z.infer<typeof itemKind>;
export const TREATMENTS = ['cutout', 'paper', 'cover', 'poster', 'lettering', 'logo', 'typeset', 'none'] as const;
export const treatment = z.enum(TREATMENTS);
export type Treatment = z.infer<typeof treatment>;

export const relation = z.looseObject({
  to: ref,
  kind: z.string().default('related'),
  note: z.string().optional(),
});

export const artwork = z.looseObject({
  poster: z.string().optional(), // provider ref: "tmdb:/abc.jpg"
  cover: z.string().optional(), // "openlibrary:OL123M", "caa:<rg>"
  logo: z.string().optional(), // "tmdb-logo:/x.png"
  treatment: treatment.optional(),
  media: z.string().optional(), // med_… owning the cached/derived files
  clip: z.string().optional(), // "/m/med_…/clip-<hash8>.png"
  clip_size: z.tuple([z.number(), z.number()]).optional(),
  thumb: z.string().optional(),
  thumb_size: z.tuple([z.number(), z.number()]).optional(),
  full: z.string().optional(), // "/m/med_…/poster-<hash8>.webp" or cover
  full_size: z.tuple([z.number(), z.number()]).optional(),
  alt: z.string().optional(),
});
export type Artwork = z.infer<typeof artwork>;

const base = {
  id: z.string().regex(/^[a-z]+_[0-9a-z]{12}$/),
  visibility: visibility.default('public'),
  created: dateish.optional(),
  updated: dateish.optional(),
  tags: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  related: z.array(relation).default([]),
  locked: z.array(z.string()).default([]),
};

// ---------- items ----------
export const releaseDates = z.looseObject({
  premiere: isoDate.optional(),
  theatrical_limited: isoDate.optional(),
  theatrical: isoDate.optional(),
  digital: isoDate.optional(),
  physical: isoDate.optional(),
  tv: isoDate.optional(),
});
export type ReleaseDates = z.infer<typeof releaseDates>;

export const itemSchema = z.looseObject({
  ...base,
  type: z.literal('item'),
  kind: itemKind,
  title: z.string(),
  year: z.number().int().optional(),
  status: z.enum(['active', 'archived']).default('active'),
  finished: isoDate.optional(), // owner marked it finished (watched/read/listened)
  artwork: artwork.optional(),
  sources: z.record(z.string(), z.looseObject({ fetched: dateish.optional() })).optional(),
  // film / tv
  tmdb_id: z.number().int().optional(),
  imdb_id: z.string().optional(),
  director: z.array(z.string()).optional(),
  creators: z.array(z.string()).optional(),
  cast: z.array(z.string()).optional(),
  synopsis: z.string().optional(),
  runtime: z.number().int().optional(),
  genres: z.array(z.string()).optional(),
  release_dates: releaseDates.optional(),
  first_air_date: isoDate.optional(),
  next_episode: z.looseObject({ season: z.number().optional(), episode: z.number().optional(), air_date: isoDate.optional() }).optional(),
  // book
  openlibrary_id: z.string().optional(),
  isbn13: z.string().optional(),
  authors: z.array(z.string()).optional(),
  published: isoDate.optional(),
  published_year: z.number().int().optional(),
  publisher: z.string().optional(),
  // album
  musicbrainz_rg: z.string().optional(),
  artist: z.string().optional(),
  released: isoDate.optional(),
  // product / place / link
  url: z.string().optional(),
  site_name: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(), // shared vocabulary: Apparel, Books & Magazines, Home, …
  subtype: z.string().optional(), // T-shirts, Socks, Subscription
  price: z.number().optional(),
  currency: z.string().default('USD'),
  details: z.string().optional(), // size, colour, format
  source_image: z.string().optional(),
  og_title: z.string().optional(),
  og_description: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // photo
  media: z.string().optional(),
  taken: dateish.optional(),
  approved: z.boolean().default(false),
});
export type Item = z.infer<typeof itemSchema>;

// ---------- lists ----------
export const listForm = z.enum(['seal', 'arch', 'stepped', 'slip']);
export type ListForm = z.infer<typeof listForm>;
export const listSchema = z.looseObject({
  ...base,
  type: z.literal('list'),
  list_type: z.string(),
  title: z.string(),
  sort: z.enum(['added-desc', 'added-asc', 'finished-desc', 'title', 'manual']).default('added-desc'),
  summary: z.string().optional(),
  form: listForm.optional(), // shape on the home wall; the wall chooses when unset
});
export type List = z.infer<typeof listSchema>;

export const listEntrySchema = z.looseObject({
  ...base,
  type: z.literal('list-entry'),
  list: ref,
  item: ref,
  added: isoDate,
  state: z.enum(['active', 'done', 'removed']).default('active'),
  finished: isoDate.optional(), // when it was watched / read / listened
  from: ref.optional(), // the list it moved from on completion (Watched ← Watchlist 1950s)
  for: ref.optional(), // gifts: recipient, never public
  capture: z.string().optional(),
  order: z.number().optional(),
});
export type ListEntry = z.infer<typeof listEntrySchema>;

// ---------- writing / feed / review ----------
export const writingSchema = z.looseObject({
  ...base,
  type: z.literal('writing'),
  collection: z.string(),
  title: z.string(),
  date: dateish,
  summary: z.string().optional(),
  draft: z.boolean().default(false),
  cover: z.string().optional(), // med_… or a relative attachment path
  artwork: artwork.optional(),
});
export type Writing = z.infer<typeof writingSchema>;

export const feedSchema = z.looseObject({
  ...base,
  type: z.literal('feed'),
  date: dateish,
  title: z.string().optional(),
  about: ref.optional(),
  draft: z.boolean().default(false),
  artwork: artwork.optional(),
});
export type Feed = z.infer<typeof feedSchema>;

export const reviewSchema = z.looseObject({
  ...base,
  type: z.literal('review'),
  item: ref,
  title: z.string().optional(),
  date: dateish,
  rating: z.number().optional(),
  liked: z.boolean().optional(),
  draft: z.boolean().default(false),
});
export type Review = z.infer<typeof reviewSchema>;

// ---------- people / tags ----------
export const personSchema = z.looseObject({
  ...base,
  type: z.literal('person'),
  name: z.string(),
  visibility: visibility.default('private'),
  public_alias: z.string().optional(),
});
export type Person = z.infer<typeof personSchema>;

export const tagSchema = z.looseObject({
  ...base,
  type: z.literal('tag'),
  name: z.string(),
  description: z.string().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

// ---------- config notes ----------
export const collectionDef = z.looseObject({
  key: z.string(),
  title: z.string(),
  path: z.string().optional(), // defaults to writing/<key>
  form: z.enum(['arch', 'stepped']).default('arch'),
  feed: z.boolean().default(true),
  nav: z.boolean().default(false),
});
export const listTypeDef = z.looseObject({
  key: z.string(),
  title: z.string(),
  queue: z.boolean().default(false), // media queue (watchlist, reading): one collection tile on the wall, full posters
  item_kinds: z.array(itemKind).default([]),
  default_for: z.array(itemKind).default([]),
  add_label: z.string().optional(),
  private_default: z.boolean().default(false),
  allow_for: z.boolean().default(false), // gifts: entries may carry `for:`
  form: listForm.optional(), // default shape on the wall for lists of this type
  done: z.boolean().default(false), // holds finished things (Watched, Read, Listened)
  completion: z.looseObject({ list: z.string(), label: z.string().optional() }).optional(), // finishing moves an entry to this list type's list
});
export const siteConfigSchema = z.looseObject({
  type: z.literal('config'),
  title: z.string(),
  url: z.string(),
  timezone: z.string().default('America/Los_Angeles'),
  mention_policy: z.enum(['text', 'alias', 'redact']).default('text'),
  horizon: z.looseObject({ kinds: z.array(itemKind).default(['film', 'tv']), window_days: z.number().default(365) }).default({ kinds: ['film', 'tv'], window_days: 365 }),
  connection_auto_threshold: z.number().default(0.8),
  rating_scale: z.number().default(5),
  categories: z.array(z.looseObject({ key: z.string(), title: z.string().optional() })).default([]),
});
export const collectionsConfigSchema = z.looseObject({ type: z.literal('config'), collections: z.array(collectionDef) });
export const listTypesConfigSchema = z.looseObject({ type: z.literal('config'), list_types: z.array(listTypeDef) });
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type CollectionDef = z.infer<typeof collectionDef>;
export type ListTypeDef = z.infer<typeof listTypeDef>;

export const RECORD_TYPES = ['item', 'list', 'list-entry', 'writing', 'feed', 'review', 'person', 'tag', 'config'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const schemaByType = {
  item: itemSchema,
  list: listSchema,
  'list-entry': listEntrySchema,
  writing: writingSchema,
  feed: feedSchema,
  review: reviewSchema,
  person: personSchema,
  tag: tagSchema,
} as const;

export type AnyRecord = Item | List | ListEntry | Writing | Feed | Review | Person | Tag;

/** Validate frontmatter by its `type`. Returns {ok, data|error}. Config notes are validated separately. */
export function validateRecord(fm: Record<string, unknown>):
  | { ok: true; data: AnyRecord }
  | { ok: false; error: string } {
  const t = fm.type;
  if (typeof t !== 'string' || !(t in schemaByType)) return { ok: false, error: `unknown type: ${String(t)}` };
  const r = schemaByType[t as keyof typeof schemaByType].safeParse(fm);
  if (!r.success) return { ok: false, error: z.prettifyError(r.error) };
  return { ok: true, data: r.data as AnyRecord };
}
