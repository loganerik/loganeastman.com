import { describe, it, expect } from 'vitest';
import { parseNote, serializeNote, setKeys, patchFrontmatter, hasConflictMarkers, parseWikilink, validateRecord, newId, slugify, itemSlug } from '../src/index.ts';

const note = `---
id: film_01abcdefghjk
type: item
kind: film
title: The Brutalist # a comment
year: 2024
visibility: public
tags: [noir]
---

Why I care, in my own words.
`;

describe('frontmatter', () => {
  it('parses', () => {
    const p = parseNote(note);
    expect(p.frontmatter.title).toBe('The Brutalist');
    expect(p.body).toBe('\nWhy I care, in my own words.\n');
  });
  it('patches keys preserving order, comments and body bytes', () => {
    const out = setKeys(note, { director: ['Brady Corbet'], year: 2024, runtime: 215 });
    expect(out).toContain('title: The Brutalist # a comment');
    expect(out.indexOf('id:')).toBeLessThan(out.indexOf('type:'));
    expect(out).toContain('director:\n  - Brady Corbet');
    expect(out.endsWith('\nWhy I care, in my own words.\n')).toBe(true);
  });
  it('returns the same text when nothing changes', () => {
    expect(setKeys(note, { year: 2024 })).toBe(note);
  });
  it('round-trips serializeNote', () => {
    const s = serializeNote({ id: newId('feed'), type: 'feed', date: '2026-11-26', visibility: 'public' }, 'Hello.');
    const p = parseNote(s);
    expect(p.frontmatter.type).toBe('feed');
    expect(p.body.trim()).toBe('Hello.');
  });
  it('detects conflicts', () => {
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n')).toBe(true);
    expect(hasConflictMarkers(note)).toBe(false);
  });
});

describe('wikilink + schema', () => {
  it('parses wikilinks', () => {
    expect(parseWikilink('[[items/films/x#Cast|The X]]')).toEqual({ target: 'items/films/x', anchor: 'Cast', label: 'The X' });
    expect(parseWikilink('nope')).toBeNull();
  });
  it('validates a film', () => {
    const r = validateRecord(parseNote(note).frontmatter);
    expect(r.ok).toBe(true);
  });
  it('rejects a bad ref', () => {
    const r = validateRecord({ id: 'entry_01abcdefghjk', type: 'list-entry', list: 'watchlist', item: '[[x]]', added: '2026-01-01' });
    expect(r.ok).toBe(false);
  });
  it('slugs', () => {
    expect(itemSlug("The Brutalist", 2024)).toBe('the-brutalist-2024');
    expect(slugify("Dune: Part Three — l'été & more")).toBe('dune-part-three-lete-and-more');
  });
});

import { parseConflict, resolveConflict, conflictSides } from '../src/index.ts';
describe('conflicts', () => {
  const t = 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> origin/main\nz\n';
  it('parses and resolves', () => {
    const p = parseConflict(t);
    expect(p.hunks).toHaveLength(1);
    expect(resolveConflict(p, ['theirs'])).toBe('a\ntheirs\nz\n');
    expect(conflictSides(t).ours).toBe('a\nmine\nz\n');
  });
});
