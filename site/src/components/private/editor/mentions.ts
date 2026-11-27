// `@Name` and `#tag` typed in the text are data too: they become people (related mentions) and tags on the record.
import { api } from '../api';
import { relatedWithPeople, peopleFromRelated } from './fields';

export function extractMentions(raw: string): { body: string; people: string[]; tags: string[] } {
  const people: string[] = [], tags: string[] = [];
  const lines = raw.trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  if (lines.length > 1 && /^(\s*[@#][\w/-]+)+\s*$/.test(last)) lines.pop();
  for (const m of raw.matchAll(/(^|[\s(])@([A-Za-z][\w'-]*)/g)) if (!people.includes(m[2]!)) people.push(m[2]!);
  for (const m of raw.matchAll(/(^|[\s(])#([A-Za-z][\w/-]*)/g)) if (!tags.includes(m[2]!)) tags.push(m[2]!);
  return { body: lines.join('\n').trim(), people, tags };
}

/** Merge what the text mentions into the frontmatter (never drops what is already there). */
export function syncMentions(fm: Record<string, unknown>, body: string): Record<string, unknown> {
  const m = extractMentions(body);
  const tags = [...new Set([...((fm.tags as string[]) ?? []), ...m.tags])];
  const people = [...new Set([...peopleFromRelated(fm.related), ...m.people])];
  return { ...fm, ...(tags.length ? { tags } : {}), ...(people.length ? { related: relatedWithPeople(fm.related, people) } : {}) };
}

/** Make sure every mentioned person exists as a (private) record. Idempotent on the worker side. */
export async function ensurePeople(names: string[]): Promise<void> {
  await Promise.all(names.map((name) => api('/api/people', { method: 'POST', body: JSON.stringify({ name }) }).catch(() => {})));
}
