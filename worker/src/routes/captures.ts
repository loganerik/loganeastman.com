import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { requireScopes } from '../auth/tokens';
import { newId } from '@lem/vault-core';
import { one, all, run, now, json } from '../db';

export const captures = new Hono<AppEnv>();

const captureInput = z.object({
  client_id: z.string().min(8).max(80).optional(),
  url: z.string().trim().max(2048).optional().default(''),
  why: z.string().trim().max(2000).optional().default(''),
  text: z.string().trim().max(5000).optional().default(''),
  title: z.string().trim().max(300).optional().default(''),
  intent: z.enum(['writing', 'feed', 'list', 'review']).or(z.literal('')).optional(),
  list_hint: z.string().max(80).optional(),
  visibility: z.enum(['public', 'private']).optional().default('public'),
});

export interface CaptureRow {
  id: string; client_id: string | null; url: string | null; text: string | null; title: string | null; why: string;
  intent: string | null; list_hint: string | null; visibility: string; status: string; claimed_by: string | null; claimed_until: string | null;
  result_json: string | null; error: string | null; created_at: string; updated_at: string;
}

export function publicCapture(r: CaptureRow) {
  return { ...r, result: json(r.result_json, null), result_json: undefined };
}

/** Persist first, think later. Idempotent on client_id. Returns {capture, created}. */
export async function createCapture(env: AppEnv['Bindings'], input: z.infer<typeof captureInput>): Promise<{ capture: CaptureRow; created: boolean }> {
  if (input.client_id) {
    const existing = await one<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE client_id = ?', input.client_id);
    if (existing) return { capture: existing, created: false };
  }
  if (!input.url && !input.why && !input.text) throw new Error('nothing to save');
  const id = newId('cap');
  const t = now();
  await run(
    env.DB,
    `INSERT INTO captures (id, client_id, url, text, title, why, intent, list_hint, visibility, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    id, input.client_id ?? null, input.url || null, input.text || null, input.title || null, input.why, input.intent || null, input.list_hint ?? null, input.visibility, t, t,
  );
  await run(env.DB, `INSERT OR IGNORE INTO jobs (id, kind, subject_id, idempotency_key, status, next_run_at, created_at, updated_at) VALUES (?, 'organize', ?, ?, 'pending', ?, ?, ?)`,
    newId('job'), id, `organize:${id}`, t, t, t);
  const capture = (await one<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE id = ?', id))!;
  return { capture, created: true };
}

captures.post('/api/captures', requireOwner, async (c) => {
  const parsed = captureInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
  try {
    const { capture, created } = await createCapture(c.env, parsed.data);
    const stub = c.env.PROCESSOR.get(c.env.PROCESSOR.idFromName('main'));
    c.executionCtx.waitUntil(stub.fetch(new Request('https://do/poke', { method: 'POST' })).catch(() => {}));
    return c.json({ capture: publicCapture(capture), created }, created ? 201 : 200);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

captures.get('/api/captures', requireScopes('inbox:read'), async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const rows = status && status !== 'all'
    ? await all<CaptureRow>(c.env.DB, 'SELECT * FROM captures WHERE status = ? ORDER BY created_at DESC LIMIT ?', status, limit)
    : await all<CaptureRow>(c.env.DB, 'SELECT * FROM captures ORDER BY created_at DESC LIMIT ?', limit);
  return c.json({ captures: rows.map(publicCapture) });
});

captures.get('/api/captures/:id', requireScopes('inbox:read'), async (c) => {
  const row = await one<CaptureRow>(c.env.DB, 'SELECT * FROM captures WHERE id = ?', c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  const steps = await all(c.env.DB, 'SELECT s.step, s.status, s.output_json, s.updated_at FROM job_steps s JOIN jobs j ON j.id = s.job_id WHERE j.subject_id = ? ORDER BY s.updated_at', row.id);
  const question = await one(c.env.DB, "SELECT * FROM questions WHERE capture_id = ? AND status = 'open' ORDER BY created_at DESC", row.id);
  return c.json({ capture: publicCapture(row), steps, question });
});
