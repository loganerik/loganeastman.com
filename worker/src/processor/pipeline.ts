// The built-in organize pipeline: fetch_source → identify → resolve_item → decide → enrich → commit → media.
// Each step's output is stored in job_steps so a retry resumes instead of redoing (and never duplicates).
import { z } from 'zod';
import type { Env } from '../env';
import { fetchPageFacts, hintFromUrl, titleYearFrom, judge, Tmdb, OpenLibrary, MusicBrainz, apparelSubtype, type PageFacts, type Match } from '@lem/providers';
import type { Identity } from './enrich';
import { ITEM_KINDS, newId } from '@lem/vault-core';
import { one, run, now, json } from '../db';
import type { CaptureRow } from '../routes/captures';
import { llmFor, SYSTEM_RULES } from './llm';
import { LlmRefusal } from './llm/provider';
import { loadVaultConfig } from '../vault/config';
import { callTool } from '../tools/registry';
import type { OrganizeDecision } from '../tools/capture_organize';

export class NeedsOwner extends Error {
  constructor(public question: string, public options: string[] = []) {
    super(question);
  }
}
export class NonRetryable extends Error {}

type Steps = Record<string, unknown>;

async function step<T>(env: Env, jobId: string, name: string, steps: Steps, fn: () => Promise<T>): Promise<T> {
  if (name in steps) return steps[name] as T;
  const out = await fn();
  steps[name] = out;
  await run(env.DB, 'INSERT OR REPLACE INTO job_steps (job_id, step, status, output_json, updated_at) VALUES (?, ?, ?, ?, ?)', jobId, name, 'done', JSON.stringify(out ?? null), now());
  return out;
}

const identifySchema = z.object({
  kind: z.enum([...ITEM_KINDS, 'none']),
  title: z.string().nullable(),
  year: z.number().int().nullable(),
  creator: z.string().nullable(),
  reasoning: z.string(),
});
const decideSchema = z.object({
  chosen_id: z.string().nullable(), // candidate id or null when none fits
  file_as: z.array(z.enum(['list', 'feed', 'review', 'writing'])),
  list: z.string().nullable(),
  ask_owner: z.string().nullable(),
});

export async function runOrganize(env: Env, job: { id: string; subject_id: string }, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<void> {
  const capture = await one<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE id = ?', job.subject_id);
  if (!capture) throw new NonRetryable('capture not found');
  if (capture.status === 'done' || capture.status === 'cancelled') return;
  await run(env.DB, "UPDATE captures SET status = 'processing', updated_at = ? WHERE id = ?", now(), capture.id);
  const steps: Steps = {};
  for (const r of await env.DB.prepare('SELECT step, output_json FROM job_steps WHERE job_id = ? AND status = ?').bind(job.id, 'done').all<{ step: string; output_json: string }>().then((x) => x.results))
    steps[r.step] = json(r.output_json, null);
  const cfg = await loadVaultConfig(env);
  const llm = llmFor(env);

  // 1. facts from the page
  const facts = await step<PageFacts | null>(env, job.id, 'fetch_source', steps, async () => {
    if (!capture.url) return null;
    try {
      return await fetchPageFacts(capture.url, fetchImpl, { via: env.PAGE_PROXY_URL || undefined });
    } catch (e) {
      return { url: capture.url, final_url: capture.url, jsonld: [], description: `fetch failed: ${(e as Error).message}` };
    }
  });

  // 2. identify: what kind of thing is this, and what should we search for?
  const identified = await step<z.infer<typeof identifySchema>>(env, job.id, 'identify', steps, async () => {
    const hint = capture.url ? hintFromUrl(capture.url) : null;
    const ty = titleYearFrom(facts?.title ?? facts?.html_title);
    if (hint?.kind === 'film' || hint?.kind === 'tv' || hint?.provider === 'imdb' || hint?.provider === 'tmdb') {
      return { kind: hint.kind ?? 'film', title: ty?.title ?? null, year: ty?.year ?? null, creator: null, reasoning: `url hint: ${hint.provider}` };
    }
    if (hint?.kind === 'book' || hint?.kind === 'album') {
      const ld = (facts?.jsonld ?? []).find((x) => x && typeof x === 'object' && /Book|MusicAlbum/.test(String((x as { '@type'?: unknown })['@type'] ?? ''))) as Record<string, unknown> | undefined;
      const creator = ld ? String((ld.author as { name?: string })?.name ?? (ld.byArtist as { name?: string })?.name ?? '') || null : null;
      return { kind: hint.kind, title: (ld?.name as string) ?? ty?.title ?? null, year: ty?.year ?? null, creator, reasoning: `url hint: ${hint.provider}` };
    }
    if (/^(book|music\.album)$/.test(facts?.type ?? '') && ty) return { kind: facts!.type === 'book' ? 'book' : 'album', title: ty.title, year: ty.year ?? null, creator: null, reasoning: 'og:type' };
    const og = facts?.type ?? '';
    if (/video\.(movie|tv_show)/.test(og) && ty) return { kind: og.includes('tv') ? 'tv' : 'film', title: ty.title, year: ty.year ?? null, creator: null, reasoning: 'og:type' };
    if (!llm) {
      if (!capture.url) return { kind: 'none', title: null, year: null, creator: null, reasoning: 'no url, no model' };
      return { kind: 'link', title: ty?.title ?? null, year: null, creator: null, reasoning: 'no model configured; filed as link' };
    }
    try {
      return await llm.structured({
        name: 'identify',
        schema: identifySchema,
        system: SYSTEM_RULES,
        user: `Owner's intent: ${capture.intent ?? 'unspecified'}\nURL: ${capture.url ?? '(none)'}\nPage title: ${facts?.title ?? ''}\nPage description: ${facts?.description ?? ''}\nSite: ${facts?.site_name ?? ''}\nJSON-LD: ${JSON.stringify(facts?.jsonld ?? []).slice(0, 2000)}\nOwner's note (do not rewrite): ${capture.why}\n\nWhat kind of thing is this (${ITEM_KINDS.join(', ')} or none for a bare thought)? Give the canonical title and year if it is a film/tv/book/album.`,
      });
    } catch (e) {
      if (e instanceof LlmRefusal) throw new NeedsOwner(`The model declined to classify this capture. What is it?`, ['film', 'tv', 'book', 'album', 'link', 'thought']);
      throw e;
    }
  });

  // 3. resolve identity at the provider
  const resolved = await step<{ match: Match['match']; identity?: Identity; candidates?: Array<{ id: string; title: string; year?: number; media_type: string; creator?: string }> }>(env, job.id, 'resolve_item', steps, async () => {
    const hint0 = capture.url ? hintFromUrl(capture.url) : null;
    if (identified.kind === 'book') {
      const ol = new OpenLibrary(fetchImpl, env.OPENLIBRARY_BASE_URL || undefined);
      if (hint0?.provider === 'isbn') return { match: 'confident', identity: { provider: 'isbn', external_id: hint0.external_id } };
      if (hint0?.provider === 'openlibrary') return { match: 'confident', identity: { provider: 'openlibrary', external_id: hint0.external_id } };
      if (!identified.title) return { match: 'none' };
      const hits = await ol.search(identified.title, { author: identified.creator ?? undefined });
      const m = judge({ title: identified.title, year: identified.year ?? undefined }, hits.map((h) => ({ id: h.olid, title: h.title, year: h.year, popularity: h.popularity, extra: { creator: h.authors.join(', ') } })));
      if (m.match === 'confident') return { match: 'confident', identity: { provider: 'openlibrary', external_id: m.candidate.id } };
      if (m.match === 'ambiguous') return { match: 'ambiguous', candidates: m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, media_type: 'book', creator: String(c.extra?.creator ?? '') })) };
      return { match: 'none' };
    }
    if (identified.kind === 'album') {
      const mb = new MusicBrainz(fetchImpl, env.MUSICBRAINZ_BASE_URL || undefined);
      if (hint0?.provider === 'musicbrainz') return { match: 'confident', identity: { provider: 'musicbrainz', external_id: hint0.external_id } };
      if (!identified.title) return { match: 'none' };
      const hits = await mb.search(identified.title, identified.creator ?? undefined);
      const m = judge({ title: identified.title, year: identified.year ?? undefined }, hits.map((h) => ({ id: h.rgid, title: h.title, year: h.year, popularity: h.score, extra: { creator: h.artist } })));
      if (m.match === 'confident') return { match: 'confident', identity: { provider: 'musicbrainz', external_id: m.candidate.id } };
      if (m.match === 'ambiguous') return { match: 'ambiguous', candidates: m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, media_type: 'album', creator: String(c.extra?.creator ?? '') })) };
      return { match: 'none' };
    }
    if (identified.kind !== 'film' && identified.kind !== 'tv') return { match: 'none' };
    if (!env.TMDB_TOKEN) throw new NonRetryable('TMDB_TOKEN is not set');
    const tmdb = new Tmdb(env.TMDB_TOKEN, fetchImpl, env.TMDB_BASE_URL || undefined, env.TMDB_IMAGE_URL || undefined);
    const hint = capture.url ? hintFromUrl(capture.url) : null;
    if (hint?.provider === 'tmdb') return { match: 'confident', identity: { provider: 'tmdb', external_id: hint.external_id, media_type: hint.media_type ?? 'movie' } };
    if (hint?.provider === 'imdb') {
      const f = await tmdb.findByImdb(hint.external_id);
      if (f) return { match: 'confident', identity: { provider: 'tmdb', external_id: String(f.id), media_type: f.media_type } };
    }
    if (!identified.title) return { match: 'none' };
    const kind = identified.kind === 'tv' ? 'tv' : 'movie';
    let hits = await tmdb.search(identified.title, { kind, year: identified.year ?? undefined });
    if (hits.length === 0 && identified.year) hits = await tmdb.search(identified.title, { kind });
    const m = judge({ title: identified.title, year: identified.year ?? undefined }, hits.map((h) => ({ id: String(h.id), title: h.title, year: h.year, popularity: h.popularity, extra: { media_type: h.media_type } })));
    if (m.match === 'confident') return { match: 'confident', identity: { provider: 'tmdb', external_id: m.candidate.id, media_type: (m.candidate.extra?.media_type as 'movie' | 'tv') ?? kind } };
    if (m.match === 'ambiguous') return { match: 'ambiguous', candidates: m.candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, media_type: String(c.extra?.media_type ?? kind) })) };
    return { match: 'none' };
  });

  // 4. decide filing (and pick among ambiguous candidates), asking the owner when it stays unclear
  const decision = await step<OrganizeDecision>(env, job.id, 'decide', steps, async () => {
    const kind = identified.kind === 'none' ? undefined : identified.kind;
    const defaultList = kind ? cfg.listTypes.find((t) => t.default_for.includes(kind))?.key : undefined;
    const existingLists = cfg.listTypes.map((t) => t.key);
    let identity = resolved.identity;
    let fileAs: OrganizeDecision['file_as'] = [];
    if (capture.intent === 'list') fileAs = [{ target: 'list', list: capture.list_hint ?? defaultList }];
    else if (capture.intent === 'feed') fileAs = [{ target: 'feed' }];
    else if (capture.intent === 'review') fileAs = [{ target: 'review' }];
    else if (capture.intent === 'writing') fileAs = [{ target: 'writing' }];
    else if (identity && defaultList) fileAs = [{ target: 'list', list: capture.list_hint ?? defaultList }];
    else if (kind === 'link' || kind === undefined) fileAs = [{ target: 'feed' }];

    if (resolved.match === 'ambiguous' && resolved.candidates?.length) {
      let chosen: string | null = null;
      if (llm) {
        try {
          const d = await llm.structured({
            name: 'decide',
            schema: decideSchema,
            system: SYSTEM_RULES,
            user: `The owner captured: ${capture.url ?? ''}\nPage title: ${facts?.title ?? ''}\nOwner's note: ${capture.why}\nCandidates:\n${resolved.candidates.map((c) => `- id=${c.id} ${c.title} (${c.year ?? '?'}, ${c.media_type})`).join('\n')}\nLists available: ${existingLists.join(', ')}\nPick the candidate the owner clearly means, or null if it is not clear. Suggest file_as targets (${capture.intent ? 'the owner chose ' + capture.intent : 'owner left it to you'}).`,
            effort: 'medium',
          });
          chosen = d.chosen_id;
          if (!fileAs.length && d.file_as.length) fileAs = d.file_as.map((t) => (t === 'list' ? { target: 'list', list: d.list ?? defaultList } : { target: t })) as OrganizeDecision['file_as'];
        } catch (e) {
          if (!(e instanceof LlmRefusal)) throw e;
        }
      }
      const c = resolved.candidates.find((x) => x.id === chosen);
      if (!c) throw new NeedsOwner(`Which one did you mean?`, resolved.candidates.map((x) => `${x.title}${x.creator ? ' — ' + x.creator : ''} (${x.year ?? '?'}) [${x.media_type === 'book' ? 'openlibrary' : x.media_type === 'album' ? 'musicbrainz' : 'tmdb'}:${x.id}:${x.media_type}]`));
      identity = c.media_type === 'book' ? { provider: 'openlibrary', external_id: c.id } : c.media_type === 'album' ? { provider: 'musicbrainz', external_id: c.id } : { provider: 'tmdb', external_id: c.id, media_type: c.media_type === 'tv' ? 'tv' : 'movie' };
    }
    if ((kind === 'film' || kind === 'tv' || kind === 'book' || kind === 'album') && !identity) throw new NeedsOwner(`I could not find "${identified.title ?? capture.url}" at the provider. Paste a direct link (TMDB, IMDb, Open Library, MusicBrainz), or tell me the exact title and year.`);
    if (!fileAs.length) fileAs = [{ target: 'feed' }];
    const og = facts && !identity ? { og_image: facts.image, site_name: facts.site_name, description: facts.description, product: facts.product || facts.title ? { ...(facts.product ?? {}), subtype: facts.product?.category === 'Apparel' ? apparelSubtype(facts.title ?? '') : undefined } : undefined } : {};
    return { kind: kind ?? 'none', identity, title: identified.title ?? facts?.title ?? undefined, year: identified.year ?? undefined, url: capture.url ?? undefined, ...og, file_as: fileAs, visibility: capture.visibility as 'public' | 'private', confidence: resolved.match === 'confident' ? 0.95 : 0.7, connections: [] };
  });

  // 5+6. enrich + commit happen inside capture_organize (the same tool an external agent would call)
  const result = await callTool({ env, principal: { kind: 'builtin' } }, 'capture_organize', { capture_id: capture.id, decision });
  await run(env.DB, "UPDATE captures SET status = 'done', result_json = ?, error = NULL, updated_at = ? WHERE id = ?", JSON.stringify(result), now(), capture.id);
}

export async function askOwner(env: Env, capture: { id: string }, q: NeedsOwner, askedBy = 'builtin'): Promise<void> {
  await run(env.DB, 'INSERT INTO questions (id, capture_id, question, options_json, status, asked_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId('q'), capture.id, q.question, JSON.stringify(q.options), 'open', askedBy, now());
  await run(env.DB, "UPDATE captures SET status = 'needs_owner', updated_at = ? WHERE id = ?", now(), capture.id);
}
