import { z } from 'zod';
import { defineTool, ToolError } from './registry';
import { one, all, run, now, json } from '../db';
import type { CaptureRow } from '../routes/captures';
import { publicCapture } from '../routes/captures';
import { enqueue } from '../processor/jobs';

export const inboxList = defineTool({
  name: 'inbox_list',
  description: 'List captures in the inbox by status (queued, processing, needs_owner, failed, done, all).',
  input: z.object({ status: z.enum(['captured', 'queued', 'processing', 'needs_owner', 'failed', 'done', 'all']).default('queued'), limit: z.number().int().min(1).max(200).default(50) }),
  scopes: ['inbox:read'],
  async handler({ env }, { status, limit }) {
    const rows = status === 'all'
      ? await all<CaptureRow>(env.DB, 'SELECT * FROM captures ORDER BY created_at DESC LIMIT ?', limit)
      : await all<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE status = ? ORDER BY created_at DESC LIMIT ?', status, limit);
    const open = await all<{ capture_id: string; question: string; options_json: string }>(env.DB, "SELECT capture_id, question, options_json FROM questions WHERE status = 'open'");
    const q = new Map(open.map((x) => [x.capture_id, { question: x.question, options: json(x.options_json, []) }]));
    return { captures: rows.map((r) => ({ ...publicCapture(r), question: q.get(r.id) ?? null })) };
  },
});

export const inboxGet = defineTool({
  name: 'inbox_get',
  description: 'Everything known about one capture: fields, pipeline steps so far, any open question and its answer.',
  input: z.object({ capture_id: z.string() }),
  scopes: ['inbox:read'],
  async handler({ env }, { capture_id }) {
    const row = await one<CaptureRow>(env.DB, 'SELECT * FROM captures WHERE id = ?', capture_id);
    if (!row) throw new ToolError('capture not found', 404);
    const steps = await all<{ step: string; status: string; output_json: string; updated_at: string }>(env.DB, 'SELECT s.step, s.status, s.output_json, s.updated_at FROM job_steps s JOIN jobs j ON j.id = s.job_id WHERE j.subject_id = ? ORDER BY s.updated_at', row.id);
    const questions = await all(env.DB, 'SELECT * FROM questions WHERE capture_id = ? ORDER BY created_at DESC', row.id);
    return { capture: publicCapture(row), steps: steps.map((s) => ({ ...s, output: json(s.output_json, null), output_json: undefined })), questions };
  },
});

export const captureClaim = defineTool({
  name: 'capture_claim',
  description: 'Claim a capture for a while so the built-in processor leaves it to you. Expires automatically.',
  input: z.object({ capture_id: z.string(), ttl_s: z.number().int().min(30).max(3600).default(600) }),
  scopes: ['inbox:write'],
  async handler({ env, principal }, { capture_id, ttl_s }) {
    const who = principal.kind === 'agent' ? principal.name : principal.kind;
    const until = new Date(Date.now() + ttl_s * 1000).toISOString();
    const r = await run(env.DB, "UPDATE captures SET claimed_by = ?, claimed_until = ?, updated_at = ? WHERE id = ? AND status IN ('queued','needs_owner','failed','processing')", who, until, now(), capture_id);
    if (!r.meta.changes) throw new ToolError('capture not claimable', 409);
    return { claimed_until: until };
  },
});

export const inboxProcess = defineTool({
  name: 'inbox_process',
  description: 'Run the built-in processor over queued captures (or the given ones) now.',
  input: z.object({ capture_ids: z.array(z.string()).optional(), max: z.number().int().min(1).max(50).default(10), force: z.boolean().default(false) }),
  scopes: ['inbox:write'],
  async handler({ env }, { capture_ids, max, force }) {
    const rows = capture_ids?.length
      ? await all<CaptureRow>(env.DB, `SELECT * FROM captures WHERE id IN (${capture_ids.map(() => '?').join(',')})`, ...capture_ids)
      : await all<CaptureRow>(env.DB, "SELECT * FROM captures WHERE status IN ('queued','failed') ORDER BY created_at LIMIT ?", max);
    const started: string[] = [];
    const skipped: Array<{ capture_id: string; reason: string }> = [];
    for (const c of rows) {
      if (c.status === 'done') { skipped.push({ capture_id: c.id, reason: 'done' }); continue; }
      if (!force && c.claimed_until && c.claimed_until > now()) { skipped.push({ capture_id: c.id, reason: `claimed by ${c.claimed_by}` }); continue; }
      await run(env.DB, "UPDATE captures SET status = 'queued', claimed_by = NULL, claimed_until = NULL, error = NULL, updated_at = ? WHERE id = ?", now(), c.id);
      await run(env.DB, "UPDATE jobs SET status = 'pending', attempts = 0, next_run_at = ?, lease_until = NULL, updated_at = ? WHERE idempotency_key = ?", now(), now(), `organize:${c.id}`);
      await enqueue(env, 'organize', c.id, `organize:${c.id}`);
      started.push(c.id);
    }
    return { started, skipped };
  },
});

export const ownerAsk = defineTool({
  name: 'owner_ask',
  description: 'Ask the owner a question about a capture or record. They answer in /private; the answer shows up in inbox_get.',
  input: z.object({ capture_id: z.string().optional(), record_id: z.string().optional(), question: z.string().min(3), options: z.array(z.string()).default([]) }),
  scopes: ['inbox:write'],
  async handler({ env, principal }, { capture_id, record_id, question, options }) {
    const id = `q_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const who = principal.kind === 'agent' ? principal.name : principal.kind;
    await run(env.DB, 'INSERT INTO questions (id, capture_id, record_id, question, options_json, status, asked_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, capture_id ?? null, record_id ?? null, question, JSON.stringify(options), 'open', who, now());
    if (capture_id) await run(env.DB, "UPDATE captures SET status = 'needs_owner', updated_at = ? WHERE id = ?", now(), capture_id);
    return { question_id: id, status: 'open' };
  },
});
