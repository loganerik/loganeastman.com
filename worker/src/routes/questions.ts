// Owner answers questions and retries captures from /private.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { one, all, run, now } from '../db';
import { enqueue } from '../processor/jobs';

export const questions = new Hono<AppEnv>();

questions.get('/api/questions', requireOwner, async (c) => c.json({ questions: await all(c.env.DB, "SELECT * FROM questions WHERE status = 'open' ORDER BY created_at DESC") }));

questions.post('/api/questions/:id/answer', requireOwner, async (c) => {
  const { answer } = (await c.req.json().catch(() => ({}))) as { answer?: string };
  if (!answer) return c.json({ error: 'answer required' }, 400);
  const q = await one<{ id: string; capture_id: string | null }>(c.env.DB, 'SELECT id, capture_id FROM questions WHERE id = ?', c.req.param('id'));
  if (!q) return c.json({ error: 'not found' }, 404);
  await run(c.env.DB, "UPDATE questions SET answer = ?, status = 'answered', answered_at = ? WHERE id = ?", answer, now(), q.id);
  if (q.capture_id) {
    // an answer of the form [tmdb:ID:movie] (from the offered options) resolves the identity directly
    const m = /\[(tmdb|openlibrary|musicbrainz):([^:\]]+):(movie|tv|book|album)\]/.exec(answer);
    const url = m ? (m[1] === 'tmdb' ? `https://www.themoviedb.org/${m[3]}/${m[2]}` : m[1] === 'openlibrary' ? `https://openlibrary.org/works/${m[2]}` : `https://musicbrainz.org/release-group/${m[2]}`) : null;
    if (url) await run(c.env.DB, "UPDATE captures SET url = ?, status = 'queued', error = NULL, updated_at = ? WHERE id = ?", url, now(), q.capture_id);
    else await run(c.env.DB, "UPDATE captures SET why = CASE WHEN why = '' THEN ? ELSE why END, text = COALESCE(text, '') || ' ' || ?, status = 'queued', error = NULL, updated_at = ? WHERE id = ?", answer, `Owner answered: ${answer}`, now(), q.capture_id);
    await run(c.env.DB, 'DELETE FROM job_steps WHERE job_id IN (SELECT id FROM jobs WHERE idempotency_key = ?)', `organize:${q.capture_id}`);
    await run(c.env.DB, "UPDATE jobs SET status = 'pending', attempts = 0, next_run_at = ?, lease_until = NULL, updated_at = ? WHERE idempotency_key = ?", now(), now(), `organize:${q.capture_id}`);
    await enqueue(c.env, 'organize', q.capture_id, `organize:${q.capture_id}`);
  }
  return c.json({ ok: true });
});

questions.post('/api/captures/:id/retry', requireOwner, async (c) => {
  const id = c.req.param('id');
  const cap = await one<{ id: string; status: string }>(c.env.DB, 'SELECT id, status FROM captures WHERE id = ?', id);
  if (!cap) return c.json({ error: 'not found' }, 404);
  await run(c.env.DB, "UPDATE captures SET status = 'queued', error = NULL, claimed_by = NULL, claimed_until = NULL, updated_at = ? WHERE id = ?", now(), id);
  await run(c.env.DB, "UPDATE jobs SET status = 'pending', attempts = 0, next_run_at = ?, lease_until = NULL, updated_at = ? WHERE idempotency_key = ?", now(), now(), `organize:${id}`);
  await enqueue(c.env, 'organize', id, `organize:${id}`);
  return c.json({ ok: true });
});

questions.post('/api/captures/:id/visibility', requireOwner, async (c) => {
  const { visibility } = (await c.req.json().catch(() => ({}))) as { visibility?: string };
  if (visibility !== 'public' && visibility !== 'private') return c.json({ error: 'visibility must be public or private' }, 400);
  await run(c.env.DB, 'UPDATE captures SET visibility = ?, updated_at = ? WHERE id = ?', visibility, now(), c.req.param('id'));
  return c.json({ ok: true });
});

questions.delete('/api/captures/:id', requireOwner, async (c) => {
  await run(c.env.DB, "UPDATE captures SET status = 'cancelled', updated_at = ? WHERE id = ? AND status != 'done'", now(), c.req.param('id'));
  return c.json({ ok: true });
});
