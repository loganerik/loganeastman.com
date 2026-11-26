import { describe, it, expect } from 'vitest';
import { hintFromUrl, judge, titleYearFrom, parseHtmlFacts, releaseDatesFor } from '../src/index.ts';

describe('identity', () => {
  it('reads provider ids from urls', () => {
    expect(hintFromUrl('https://www.themoviedb.org/movie/549509-the-brutalist')).toMatchObject({ provider: 'tmdb', external_id: '549509', media_type: 'movie' });
    expect(hintFromUrl('https://www.imdb.com/title/tt8999762/')).toMatchObject({ provider: 'imdb', external_id: 'tt8999762' });
    expect(hintFromUrl('https://letterboxd.com/film/the-brutalist/')).toMatchObject({ provider: 'letterboxd', kind: 'film' });
    expect(hintFromUrl('https://bookshop.org/p/books/x-9780393866704')).toMatchObject({ provider: 'isbn', external_id: '9780393866704' });
    expect(hintFromUrl('not a url')).toBeNull();
  });
  it('parses title and year from page titles', () => {
    expect(titleYearFrom('The Brutalist (2024) directed by Brady Corbet • Reviews, film + cast • Letterboxd')).toEqual({ title: 'The Brutalist', year: 2024 });
    expect(titleYearFrom('Nosferatu')).toEqual({ title: 'Nosferatu' });
  });
  it('judges matches', () => {
    const r = [{ id: '1', title: 'Nosferatu', year: 2024, popularity: 50 }, { id: '2', title: 'Nosferatu', year: 1922, popularity: 20 }, { id: '3', title: 'Nosferatu the Vampyre', year: 1979, popularity: 10 }];
    expect(judge({ title: 'Nosferatu', year: 2024 }, r)).toMatchObject({ match: 'confident', candidate: { id: '1' } });
    expect(judge({ title: 'Nosferatu' }, r)).toMatchObject({ match: 'ambiguous' });
    expect(judge({ title: 'The Brutalist' }, [{ id: '9', title: 'The Brutalist', year: 2024, popularity: 80 }])).toMatchObject({ match: 'confident' });
    expect(judge({ title: 'x' }, [])).toEqual({ match: 'none' });
  });
  it('parses opengraph', () => {
    const f = parseHtmlFacts('<html><head><title>T · Site</title><meta property="og:title" content="The Brutalist (2024)"><meta name="description" content="d&amp;d"><script type="application/ld+json">{"@type":"Movie","name":"The Brutalist"}</script></head></html>');
    expect(f.title).toBe('The Brutalist (2024)');
    expect(f.description).toBe('d&d');
    expect(f.jsonld).toHaveLength(1);
  });
  it('collapses release dates', () => {
    expect(releaseDatesFor([{ kind: 'premiere', date: '2024-09-01' }, { kind: 'theatrical_limited', date: '2024-12-20' }, { kind: 'theatrical', date: '2025-01-24' }, { kind: 'theatrical', date: '2025-02-01' }]))
      .toEqual({ theatrical_limited: '2024-12-20', theatrical: '2025-01-24' });
  });
});
