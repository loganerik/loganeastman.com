import type { AnyRecord, ListEntry, List, Item } from './schemas.ts';

/** A record is publishable only when explicitly public and not a draft. */
export function isPublic(r: { visibility?: string; draft?: boolean; status?: string } | null | undefined): boolean {
  if (!r) return false;
  if (r.visibility !== 'public') return false;
  if (r.draft) return false;
  if (r.status === 'draft') return false;
  return true;
}

/** A list entry is public only when the list, the item, and the entry itself are all public. */
export function entryIsPublic(entry: ListEntry, list: List | undefined, item: Item | undefined): boolean {
  return isPublic(entry) && isPublic(list) && isPublic(item) && entry.state !== 'removed';
}

/** Tags under `private/` never render publicly. */
export function isPrivateTag(tag: string): boolean {
  return tag.startsWith('private/') || tag === 'private';
}

export function publicTags(tags: string[] | undefined, tagRecords?: Map<string, { visibility?: string }>): string[] {
  return (tags ?? []).filter((t) => !isPrivateTag(t) && (tagRecords?.get(t)?.visibility ?? 'public') === 'public');
}

export type { AnyRecord };
