export interface WikiLink {
  target: string; // path without .md, as written (e.g. "items/films/the-brutalist-2024" or "The Brutalist")
  anchor?: string; // heading or ^block
  label?: string;
}

const WIKILINK_RE = /^\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/;

/** Parse a whole-string wikilink like `[[items/films/x#Heading|Label]]`. Returns null if not a wikilink. */
export function parseWikilink(s: unknown): WikiLink | null {
  if (typeof s !== 'string') return null;
  const m = WIKILINK_RE.exec(s.trim());
  if (!m) return null;
  const target = m[1]!.trim().replace(/\.md$/, '');
  return { target, anchor: m[2]?.trim(), label: m[3]?.trim() };
}

export function formatWikilink(target: string, label?: string, anchor?: string): string {
  return `[[${target}${anchor ? '#' + anchor : ''}${label ? '|' + label : ''}]]`;
}

/** Find every wikilink / embed in a Markdown body. */
export function findWikilinks(body: string): Array<WikiLink & { embed: boolean; raw: string; index: number }> {
  const out: Array<WikiLink & { embed: boolean; raw: string; index: number }> = [];
  const re = /(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push({
      embed: m[1] === '!',
      target: m[2]!.trim().replace(/\.md$/, ''),
      anchor: m[3]?.trim(),
      label: m[4]?.trim(),
      raw: m[0],
      index: m.index,
    });
  }
  return out;
}
