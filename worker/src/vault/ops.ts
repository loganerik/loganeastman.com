// Declarative vault operations: serializable (they cross the Durable Object boundary) and applied against
// the freshly read head so concurrent owner edits are absorbed instead of clobbered.
import { setKeys, patchFrontmatter, parseNote } from '@lem/vault-core';

export type VaultOp =
  | { op: 'create'; path: string; contents: string; ifAbsent?: boolean }
  | { op: 'write'; path: string; contents: string; baseSha?: string } // editor save; baseSha guards against overwrite
  | { op: 'setKeys'; path: string; keys: Record<string, unknown>; onlyIfMissing?: string[] } // top-level frontmatter keys
  | { op: 'setIn'; path: string; sets: Array<{ at: string[]; value: unknown }> } // nested, e.g. ['artwork','full']
  | { op: 'delete'; path: string };

export interface ApplyResult { path: string; status: 'added' | 'changed' | 'skipped' | 'deleted' | 'conflict'; reason?: string }

export function applyOp(op: VaultOp, current: { text: string; sha: string } | null): { contents?: string | null; result: ApplyResult } {
  switch (op.op) {
    case 'create':
      if (current) return { result: { path: op.path, status: 'skipped', reason: 'exists' } };
      return { contents: op.contents, result: { path: op.path, status: 'added' } };
    case 'write':
      if (op.baseSha && current && current.sha !== op.baseSha) return { result: { path: op.path, status: 'conflict', reason: 'changed since read' } };
      if (current && current.text === op.contents) return { result: { path: op.path, status: 'skipped', reason: 'unchanged' } };
      return { contents: op.contents, result: { path: op.path, status: current ? 'changed' : 'added' } };
    case 'setKeys': {
      if (!current) return { result: { path: op.path, status: 'skipped', reason: 'missing' } };
      const fm = parseNote(current.text).frontmatter;
      const locked = new Set((fm.locked as string[] | undefined) ?? []);
      const keys: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(op.keys)) {
        if (locked.has(k)) continue;
        if (op.onlyIfMissing?.includes(k) && fm[k] !== undefined && fm[k] !== null && fm[k] !== '') continue;
        keys[k] = v;
      }
      const next = setKeys(current.text, keys);
      if (next === current.text) return { result: { path: op.path, status: 'skipped', reason: 'unchanged' } };
      return { contents: next, result: { path: op.path, status: 'changed' } };
    }
    case 'setIn': {
      if (!current) return { result: { path: op.path, status: 'skipped', reason: 'missing' } };
      const fm = parseNote(current.text).frontmatter;
      const locked = new Set((fm.locked as string[] | undefined) ?? []);
      const next = patchFrontmatter(current.text, (doc) => {
        for (const s of op.sets) {
          if (locked.has(s.at.join('.')) || locked.has(s.at[0]!)) continue;
          if (s.value === undefined) doc.deleteIn(s.at);
          else doc.setIn(s.at, doc.createNode(s.value));
        }
      });
      if (next === current.text) return { result: { path: op.path, status: 'skipped', reason: 'unchanged' } };
      return { contents: next, result: { path: op.path, status: 'changed' } };
    }
    case 'delete':
      if (!current) return { result: { path: op.path, status: 'skipped', reason: 'missing' } };
      return { contents: null, result: { path: op.path, status: 'deleted' } };
  }
}
