// Git conflict markers: pull both sides out so the owner can choose, and rebuild the file from a choice.
export interface ConflictHunk { ours: string; theirs: string; oursLabel: string; theirsLabel: string }
export interface ParsedConflict { hunks: ConflictHunk[]; /** text with placeholders {{0}}, {{1}}… where hunks sat */ template: string }

const RE = /^<{7} ?([^\n]*)\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7} ?([^\n]*)\n?/gm;

export function parseConflict(text: string): ParsedConflict {
  const hunks: ConflictHunk[] = [];
  const template = text.replace(RE, (_m, a, ours, theirs, b) => {
    hunks.push({ oursLabel: a.trim(), ours, theirsLabel: b.trim(), theirs });
    return `{{${hunks.length - 1}}}`;
  });
  return { hunks, template };
}

/** Rebuild the file by choosing a side per hunk ('ours' | 'theirs' | 'both' | custom text). */
export function resolveConflict(parsed: ParsedConflict, choices: Array<'ours' | 'theirs' | 'both' | { text: string }>): string {
  return parsed.template.replace(/\{\{(\d+)\}\}/g, (_m, i) => {
    const h = parsed.hunks[Number(i)]!;
    const c = choices[Number(i)] ?? 'ours';
    if (c === 'ours') return h.ours;
    if (c === 'theirs') return h.theirs;
    if (c === 'both') return h.ours + h.theirs;
    return c.text;
  });
}

/** Whole-file views: everything as ours / everything as theirs. */
export function conflictSides(text: string): { ours: string; theirs: string } {
  const p = parseConflict(text);
  return { ours: resolveConflict(p, p.hunks.map(() => 'ours')), theirs: resolveConflict(p, p.hunks.map(() => 'theirs')) };
}
