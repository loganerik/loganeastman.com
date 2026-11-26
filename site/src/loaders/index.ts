// The vault index: every Markdown file in the vault, parsed once, validated, and resolvable by
// path / id / filename stem / alias. Pages read this directly (no Astro content collections), so the
// content model stays independent of the framework.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  parseNote,
  validateRecord,
  hasConflictMarkers,
  isPublic,
  parseWikilink,
  normalizeTarget,
  siteConfigSchema,
  collectionsConfigSchema,
  listTypesConfigSchema,
  type AnyRecord,
  type SiteConfig,
  type CollectionDef,
  type ListTypeDef,
} from '@lem/vault-core';

import { existsSync } from 'node:fs';
export const SITE_DIR = process.cwd();
/** The vault clone. VAULT_PATH wins; otherwise the first of ./vault, ../vault, ../../vault that exists. */
export const VAULT_DIR = (() => {
  if (process.env.VAULT_PATH) return path.resolve(SITE_DIR, process.env.VAULT_PATH);
  for (const c of ['vault', '../vault', '../../vault']) {
    const p = path.resolve(SITE_DIR, c);
    if (existsSync(path.join(p, '_config'))) return p;
  }
  return path.resolve(SITE_DIR, '../vault');
})();

export interface VaultRecord {
  path: string; // "items/films/dune-part-two-2024" (no .md)
  file: string; // absolute
  stem: string; // "dune-part-two-2024"
  type: string;
  data: AnyRecord;
  body: string;
  raw: string;
  public: boolean;
  conflict: boolean;
  mtime: number;
}

export interface MediaVariant { url: string; w: number; h: number }
export interface MediaIndex {
  attachments: Record<string, { media: string; variants: Partial<Record<'thumb' | 'full' | 'clip' | 'poster' | 'cover', MediaVariant>>; alt?: string }>;
}

export interface VaultConfig {
  site: SiteConfig;
  collections: CollectionDef[];
  listTypes: ListTypeDef[];
}

export interface VaultIndex {
  records: VaultRecord[];
  byPath: Map<string, VaultRecord>;
  byId: Map<string, VaultRecord>;
  byStem: Map<string, VaultRecord[]>;
  config: VaultConfig;
  media: MediaIndex;
  errors: Array<{ file: string; error: string }>;
  signature: string;
  /** Resolve a wikilink target (path, stem, id, alias, or title) to a record. */
  resolve(target: string): VaultRecord | undefined;
  ofType<T extends AnyRecord>(type: T['type'], opts?: { all?: boolean }): Array<VaultRecord & { data: T }>;
}

const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'attachments', '_media', 'node_modules']);

async function walk(dir: string, out: Array<{ file: string; mtime: number }> = []): Promise<Array<{ file: string; mtime: number }>> {
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.obsidian') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      const s = await stat(full);
      out.push({ file: full, mtime: s.mtimeMs });
    }
  }
  return out;
}

function defaultConfig(): VaultConfig {
  return {
    site: siteConfigSchema.parse({ type: 'config', title: 'Site', url: 'https://example.com' }),
    collections: [],
    listTypes: [],
  };
}

async function buildIndex(): Promise<VaultIndex> {
  const files = (await walk(VAULT_DIR)).sort((a, b) => a.file.localeCompare(b.file));
  const signature = files.map((f) => `${f.file}:${f.mtime}`).join('|');
  const records: VaultRecord[] = [];
  const errors: VaultIndex['errors'] = [];
  const config = defaultConfig();

  for (const { file, mtime } of files) {
    const rel = path.relative(VAULT_DIR, file).split(path.sep).join('/');
    const raw = await readFile(file, 'utf8');
    const note = parseNote(raw);
    const fm = note.frontmatter;
    if (rel.startsWith('_config/')) {
      try {
        if (rel.endsWith('site.md')) config.site = siteConfigSchema.parse(fm);
        else if (rel.endsWith('collections.md')) config.collections = collectionsConfigSchema.parse(fm).collections;
        else if (rel.endsWith('list-types.md')) config.listTypes = listTypesConfigSchema.parse(fm).list_types;
      } catch (e) {
        errors.push({ file: rel, error: String(e) });
      }
      continue;
    }
    if (!note.hasFrontmatter || typeof fm.type !== 'string') continue; // not a record (plain note)
    const conflict = hasConflictMarkers(raw);
    const v = validateRecord(fm);
    if (!v.ok) {
      errors.push({ file: rel, error: v.error });
      continue;
    }
    const p = normalizeTarget(rel);
    records.push({
      path: p,
      file,
      stem: path.basename(p),
      type: v.data.type,
      data: v.data,
      body: note.body,
      raw,
      public: isPublic(v.data) && !conflict,
      conflict,
      mtime,
    });
  }

  const byPath = new Map(records.map((r) => [r.path, r]));
  const byId = new Map(records.map((r) => [r.data.id, r]));
  const byStem = new Map<string, VaultRecord[]>();
  const byAlias = new Map<string, VaultRecord>();
  for (const r of records) {
    const k = r.stem.toLowerCase();
    byStem.set(k, [...(byStem.get(k) ?? []), r]);
    for (const a of r.data.aliases ?? []) byAlias.set(String(a).toLowerCase(), r);
    const title = (r.data as { title?: string; name?: string }).title ?? (r.data as { name?: string }).name;
    if (title) byAlias.set(String(title).toLowerCase(), byAlias.get(String(title).toLowerCase()) ?? r);
  }

  let media: MediaIndex = { attachments: {} };
  try {
    media = JSON.parse(await readFile(path.join(VAULT_DIR, '_media/index.json'), 'utf8')) as MediaIndex;
    media.attachments ??= {};
  } catch {
    /* no media index yet */
  }

  const resolve = (target: string): VaultRecord | undefined => {
    const wl = parseWikilink(target);
    const t = normalizeTarget((wl ? wl.target : target).trim());
    if (byPath.has(t)) return byPath.get(t);
    if (byId.has(t)) return byId.get(t);
    const stem = t.split('/').pop()!.toLowerCase();
    const cands = byStem.get(stem);
    if (cands?.length) {
      // Obsidian "shortest path" semantics: prefer a candidate whose path ends with the written target
      return cands.find((c) => c.path.toLowerCase().endsWith(t.toLowerCase())) ?? cands[0];
    }
    return byAlias.get(t.toLowerCase());
  };

  const ofType: VaultIndex['ofType'] = (type, opts) =>
    records.filter((r) => r.type === type && (opts?.all || r.public)) as never;

  return { records, byPath, byId, byStem, config, media, errors, signature, resolve, ofType };
}

let cached: Promise<VaultIndex> | null = null;
let cachedAt = 0;

/** Memoized per build; in dev, re-walks the vault at most every 500 ms and rebuilds when anything changed. */
export async function getIndex(): Promise<VaultIndex> {
  const dev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';
  if (cached && (!dev || Date.now() - cachedAt < 500)) return cached;
  if (cached && dev) {
    const prev = await cached;
    const files = await walk(VAULT_DIR);
    const sig = files
      .sort((a, b) => a.file.localeCompare(b.file))
      .map((f) => `${f.file}:${f.mtime}`)
      .join('|');
    cachedAt = Date.now();
    if (sig === prev.signature) return prev;
  }
  cached = buildIndex();
  cachedAt = Date.now();
  return cached;
}

export function invalidateIndex(): void {
  cached = null;
}

export { parseWikilink };
