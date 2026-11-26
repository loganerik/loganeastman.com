// One alarm-driven job runner. POST /api/captures pokes it; the per-minute cron pokes it as a watchdog.
// Jobs run serially; a lease guards against double execution if both poke at once.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { all, run, now, json } from '../db';
import { runOrganize, NeedsOwner, NonRetryable, askOwner } from '../processor/pipeline';
import { BACKOFF_MS } from '../processor/jobs';
import { deriveProviderArtwork, type DeriveJob } from '../media/derive';
import { runClipJob, type ClipJob } from '../media/clip';
import { dispatchBuild } from '../routes/github';
import '../tools';

interface JobRow { id: string; kind: string; subject_id: string; attempts: number; max_attempts: number; payload_json: string | null }

export class Processor extends DurableObject<Env> {
  private running = false;

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === '/poke') {
      await this.poke();
      return new Response('ok');
    }
    if (path === '/run-now') {
      await this.alarm();
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  async poke(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > Date.now() + 1000) await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  async alarm(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let dispatched = false;
    try {
      for (let n = 0; n < 20; n++) {
        const t = now();
        // expired leases go back to the queue (a crashed run never blocks a job for good)
        await run(this.env.DB, "UPDATE jobs SET status = 'pending', lease_until = NULL WHERE status = 'leased' AND lease_until < ?", t);
        const job = (await all<JobRow>(this.env.DB, "SELECT id, kind, subject_id, attempts, max_attempts, payload_json FROM jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY next_run_at LIMIT 1", t))[0];
        if (!job) break;
        const lease = new Date(Date.now() + 5 * 60_000).toISOString();
        const got = await run(this.env.DB, "UPDATE jobs SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'", lease, t, job.id);
        if (!got.meta.changes) continue;
        job.attempts += 1;
        try {
          const changedVault = await this.runJob(job);
          dispatched ||= changedVault;
          await run(this.env.DB, "UPDATE jobs SET status = 'succeeded', lease_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?", now(), job.id);
        } catch (e) {
          await this.failed(job, e as Error);
        }
      }
      if (dispatched) await dispatchBuild(this.env, 'processor').catch(() => {});
    } finally {
      this.running = false;
    }
    const more = await all(this.env.DB, "SELECT 1 FROM jobs WHERE status = 'pending' AND next_run_at <= ? LIMIT 1", now());
    if (more.length) await this.ctx.storage.setAlarm(Date.now() + 500);
    else {
      const next = (await all<{ next_run_at: string }>(this.env.DB, "SELECT next_run_at FROM jobs WHERE status = 'pending' ORDER BY next_run_at LIMIT 1"))[0];
      if (next) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Date.parse(next.next_run_at)));
    }
  }

  /** Returns true when the job changed the vault (so a rebuild should be dispatched). */
  private async runJob(job: JobRow): Promise<boolean> {
    switch (job.kind) {
      case 'organize':
        await runOrganize(this.env, job);
        return true;
      case 'derive_media':
        await deriveProviderArtwork(this.env, job.subject_id, json<DeriveJob>(job.payload_json, { record_path: '' }));
        return true;
      case 'derive_clip': {
        const r = await runClipJob(this.env, json<ClipJob>(job.payload_json, { record_path: null, media_id: job.subject_id, provider: 'local' }));
        return r.status === 'ready';
      }
      default:
        throw new NonRetryable(`unknown job kind ${job.kind}`);
    }
  }

  private async failed(job: JobRow, e: Error): Promise<void> {
    const t = now();
    if (e instanceof NeedsOwner) {
      await askOwner(this.env, { id: job.subject_id }, e);
      await run(this.env.DB, "UPDATE jobs SET status = 'succeeded', lease_until = NULL, last_error = ?, updated_at = ? WHERE id = ?", `needs owner: ${e.question}`, t, job.id);
      return;
    }
    const dead = e instanceof NonRetryable || job.attempts >= job.max_attempts;
    const delay = BACKOFF_MS[Math.max(0, Math.min(job.attempts - 1, BACKOFF_MS.length - 1))]!;
    await run(this.env.DB, "UPDATE jobs SET status = ?, lease_until = NULL, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?", dead ? 'dead' : 'pending', new Date(Date.now() + delay).toISOString(), e.message.slice(0, 1000), t, job.id);
    if (job.kind === 'organize') await run(this.env.DB, "UPDATE captures SET status = ?, error = ?, updated_at = ? WHERE id = ?", dead ? 'failed' : 'queued', e.message.slice(0, 500), t, job.subject_id);
  }
}
