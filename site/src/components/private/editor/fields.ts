// What each kind of record asks for: the essentials up front, everything else under "More". Human labels, titles
// from the config instead of keys, pickers instead of ids. Never id, path, type, created, updated, locked, related raw.
import type { Config } from '../api';
import { KIND_LABELS } from '../api';

export type FieldKind = 'text' | 'long' | 'date' | 'datetime' | 'bool' | 'select' | 'number' | 'tags' | 'people' | 'record' | 'visibility' | 'slug';
export interface Field { key: string; label: string; kind: FieldKind; options?: Array<{ value: string; label: string }>; placeholder?: string; recordType?: string; recordKinds?: string[]; hint?: string }
export interface FieldSet { essentials: Field[]; more: Field[] }

const vis: Field = { key: 'visibility', label: 'Who sees it', kind: 'visibility' };
const tagsF: Field = { key: 'tags', label: 'Tags', kind: 'tags', hint: 'Tags starting with private/ never show on the site' };
const peopleF: Field = { key: 'related', label: 'People', kind: 'people', hint: 'People stay private unless you make them public' };
const slugF: Field = { key: 'slug', label: 'Web address', kind: 'slug', placeholder: 'leave blank to use the title' };
const draftF: Field = { key: 'draft', label: 'Still a draft', kind: 'bool' };

export function fieldsFor(type: string, cfg: Config | null, kind?: string): FieldSet {
  const collections = (cfg?.collections ?? []).map((c) => ({ value: c.key, label: c.title }));
  const listTypes = (cfg?.listTypes ?? []).map((t) => ({ value: t.key, label: t.title }));
  switch (type) {
    case 'writing': return {
      essentials: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'collection', label: 'Collection', kind: 'select', options: collections }, { key: 'date', label: 'Date', kind: 'date' }],
      more: [{ key: 'summary', label: 'Summary', kind: 'long', placeholder: 'A line for cards and feeds' }, draftF, vis, tagsF, peopleF, slugF],
    };
    case 'feed': return {
      essentials: [],
      more: [{ key: 'title', label: 'Title', kind: 'text', placeholder: 'optional' }, { key: 'date', label: 'Date & time', kind: 'datetime' }, { key: 'about', label: 'About', kind: 'record', recordType: 'item', placeholder: 'a film, book, thing…' }, vis, tagsF, peopleF],
    };
    case 'review': return {
      essentials: [{ key: 'item', label: 'What it is about', kind: 'record', recordType: 'item' }, { key: 'rating', label: 'Rating', kind: 'number' }],
      more: [{ key: 'title', label: 'Title', kind: 'text', placeholder: 'optional' }, { key: 'date', label: 'Date', kind: 'date' }, draftF, vis, tagsF, peopleF],
    };
    case 'list': return {
      essentials: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'list_type', label: 'Kind of list', kind: 'select', options: listTypes }],
      more: [{ key: 'sort', label: 'Order', kind: 'select', options: [{ value: 'added-desc', label: 'Newest first' }, { value: 'added-asc', label: 'Oldest first' }, { value: 'finished-desc', label: 'Recently finished' }, { value: 'title', label: 'A to Z' }, { value: 'manual', label: 'By hand' }] }, { key: 'form', label: 'Shape on the wall', kind: 'select', options: [{ value: '', label: 'Let the wall choose' }, { value: 'seal', label: 'Seal' }, { value: 'arch', label: 'Arch' }, { value: 'stepped', label: 'Stepped frame' }, { value: 'slip', label: 'Slip' }] }, vis, slugF],
    };
    case 'list-entry': return {
      essentials: [{ key: 'state', label: 'State', kind: 'select', options: [{ value: 'active', label: 'On the list' }, { value: 'done', label: 'Finished' }, { value: 'removed', label: 'Taken off' }] }],
      more: [{ key: 'added', label: 'Added', kind: 'date' }, { key: 'finished', label: 'Finished on', kind: 'date' }, { key: 'for', label: 'For', kind: 'record', recordType: 'person', hint: 'Gift recipient; never public' }, vis, tagsF, peopleF],
    };
    case 'item': {
      const k = kind ?? 'link';
      const byKind: Record<string, Field[]> = {
        film: [{ key: 'year', label: 'Year', kind: 'number' }], tv: [{ key: 'year', label: 'Year', kind: 'number' }],
        book: [{ key: 'authors', label: 'Author', kind: 'tags', placeholder: 'names' }, { key: 'year', label: 'Year', kind: 'number' }],
        album: [{ key: 'artist', label: 'Artist', kind: 'text' }, { key: 'year', label: 'Year', kind: 'number' }],
        product: [{ key: 'brand', label: 'Brand', kind: 'text' }, { key: 'price', label: 'Price (USD)', kind: 'number' }],
        place: [{ key: 'url', label: 'Website', kind: 'text' }], link: [{ key: 'url', label: 'Address', kind: 'text' }], photo: [],
      };
      return {
        essentials: [{ key: 'title', label: KIND_LABELS[k] ? `${KIND_LABELS[k]} title` : 'Title', kind: 'text' }, ...(byKind[k] ?? [])],
        more: [...(k === 'product' ? [{ key: 'category', label: 'Category', kind: 'text' as const }, { key: 'subtype', label: 'Type', kind: 'text' as const, placeholder: 'Socks, T-shirts…' }, { key: 'details', label: 'Size, colour', kind: 'text' as const }, { key: 'url', label: 'Shop link', kind: 'text' as const }] : []), { key: 'finished', label: 'Finished on', kind: 'date' }, vis, tagsF, peopleF, slugF],
      };
    }
    case 'person': return { essentials: [{ key: 'name', label: 'Name', kind: 'text' }], more: [{ key: 'public_alias', label: 'Name shown publicly', kind: 'text', hint: 'Used when the site is set to show aliases' }, vis] };
    case 'tag': return { essentials: [{ key: 'name', label: 'Name', kind: 'text' }], more: [{ key: 'description', label: 'Description', kind: 'long' }, vis] };
    default: return { essentials: [], more: [vis] };
  }
}

/** related[] ⇄ people chips: only the `mention` relations that point at people. */
export function peopleFromRelated(related: unknown): string[] {
  if (!Array.isArray(related)) return [];
  return related.filter((r) => r && typeof r === 'object' && /people\//.test(String((r as { to?: string }).to ?? ''))).map((r) => String((r as { to: string }).to).replace(/^\[\[|\]\]$/g, '').replace(/^people\//, '').replace(/\|.*$/, ''));
}
export function relatedWithPeople(related: unknown, people: string[]): unknown[] {
  const keep = Array.isArray(related) ? related.filter((r) => !(r && typeof r === 'object' && /people\//.test(String((r as { to?: string }).to ?? '')))) : [];
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [...keep, ...people.map((p) => ({ to: `[[people/${slug(p)}]]`, kind: 'mention' }))];
}
