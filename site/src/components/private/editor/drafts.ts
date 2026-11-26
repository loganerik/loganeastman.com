// Draft recovery: every change lands in IndexedDB after a second; a successful save clears it.
import { get, set, del } from 'idb-keyval';

export interface Draft { frontmatter: Record<string, unknown>; body: string; baseSha: string | null; savedAt: number; mode: 'markdown' | 'rich' }
const key = (id: string) => `draft:${id}`;
export const loadDraft = (id: string) => get<Draft>(key(id)).catch(() => undefined);
export const saveDraft = (id: string, d: Draft) => set(key(id), d).catch(() => {});
export const clearDraft = (id: string) => del(key(id)).catch(() => {});
