import { parseDocument, Document, isMap, type ToStringOptions } from 'yaml';

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  body: string; // everything after the closing --- (leading newline stripped)
  raw: string;
  hasFrontmatter: boolean;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const YAML_OPTS: ToStringOptions = { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' };

/** Split a note into frontmatter (as a plain object) and body. Never throws on missing frontmatter. */
export function parseNote(raw: string): ParsedNote {
  const m = FM_RE.exec(raw);
  if (!m) return { frontmatter: {}, body: raw, raw, hasFrontmatter: false };
  const doc = parseDocument(m[1]!, { strict: false });
  const fm = (doc.toJS() ?? {}) as Record<string, unknown>;
  return { frontmatter: fm && typeof fm === 'object' ? fm : {}, body: raw.slice(m[0].length), raw, hasFrontmatter: true };
}

/** Serialize a fresh note. Key order follows insertion order of `frontmatter`. */
export function serializeNote(frontmatter: Record<string, unknown>, body: string): string {
  const doc = new Document(stripUndefined(frontmatter));
  const yaml = doc.toString(YAML_OPTS).trimEnd();
  const b = body.replace(/^\n+/, '');
  return `---\n${yaml}\n---\n${b ? '\n' + b.replace(/\n*$/, '\n') : ''}`;
}

/**
 * Patch frontmatter keys in place while preserving key order, comments, and the body byte-for-byte.
 * `patch` receives a yaml Document; use doc.set / doc.setIn / doc.delete.
 * Returns the new text, or the original if nothing changed.
 */
export function patchFrontmatter(raw: string, patch: (doc: Document) => void): string {
  const m = FM_RE.exec(raw);
  if (!m) {
    const doc = new Document({});
    patch(doc);
    return `---\n${doc.toString(YAML_OPTS).trimEnd()}\n---\n\n${raw}`;
  }
  const doc = parseDocument(m[1]!, { strict: false });
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as any;
  const before = doc.toString(YAML_OPTS);
  patch(doc);
  const after = doc.toString(YAML_OPTS);
  if (before === after) return raw;
  return `---\n${after.trimEnd()}\n---\n` + raw.slice(m[0].length).replace(/^\r?\n?/, (s) => (m[0].endsWith('\n') ? '' : s));
}

/** Set several top-level keys at once; `undefined` deletes. Arrays/objects are replaced wholesale. */
export function setKeys(raw: string, keys: Record<string, unknown>): string {
  return patchFrontmatter(raw, (doc) => {
    for (const [k, v] of Object.entries(keys)) {
      if (v === undefined) doc.delete(k);
      else doc.set(k, doc.createNode(v));
    }
  });
}

function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) o[k] = stripUndefined(x);
    return o as T;
  }
  return v;
}

export const CONFLICT_RE = /^(<{7}|={7}|>{7})( |$)/m;
export function hasConflictMarkers(raw: string): boolean {
  return CONFLICT_RE.test(raw);
}
