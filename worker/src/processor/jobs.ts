import type { Env } from '../env';
import { newId } from '@lem/vault-core';
import { run, now } from '../db';

export async function enqueue(env: Env, kind: string, subjectId: string, idempotencyKey: string, payload: unknown = null, delayMs = 0): Promise<void> {
  const t = now();
  await run(env.DB, `INSERT OR IGNORE INTO jobs (id, kind, subject_id, idempotency_key, status, next_run_at, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    newId('job'), kind, subjectId, idempotencyKey, new Date(Date.now() + delayMs).toISOString(), payload == null ? null : JSON.stringify(payload), t, t);
  const stub = env.PROCESSOR.get(env.PROCESSOR.idFromName('main'));
  await stub.fetch(new Request('https://do/poke', { method: 'POST' })).catch(() => {});
}

export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 8 * 3600_000];
