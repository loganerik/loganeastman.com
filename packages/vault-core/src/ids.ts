// Stable record ids: `<prefix>_<12 chars Crockford base32>` (60 random bits). Never change once written.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const ID_PREFIXES = {
  item: { film: 'film', tv: 'tv', book: 'book', album: 'album', product: 'product', place: 'place', link: 'link', photo: 'photo' },
  writing: 'post',
  feed: 'feed',
  list: 'list',
  'list-entry': 'entry',
  review: 'review',
  person: 'person',
  tag: 'tag',
  capture: 'cap',
  job: 'job',
  media: 'med',
} as const;

export function randomBase32(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBase32()}`;
}

export const ID_RE = /^[a-z]+_[0-9a-z]{12}$/;
export function isId(s: unknown): s is string {
  return typeof s === 'string' && ID_RE.test(s);
}
export function idPrefix(id: string): string {
  return id.split('_')[0] ?? '';
}
