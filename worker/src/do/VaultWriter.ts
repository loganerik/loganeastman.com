// Serializes every write to the vault repo so the worker never races itself, and runs the
// read → patch → createCommitOnBranch(expectedHeadOid) loop with retries on head mismatch.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { vaultFor, GitHubError } from '../vault/github';
import { applyOp, type VaultOp, type ApplyResult } from '../vault/ops';

export interface CommitRequest { message: string; ops: VaultOp[]; jobId?: string; captureId?: string }
export interface CommitResponse { oid: string | null; results: ApplyResult[]; already?: boolean }

export class VaultWriter extends DurableObject<Env> {
  private chain: Promise<unknown> = Promise.resolve();

  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/commit') return new Response('not found', { status: 404 });
    const body = (await req.json()) as CommitRequest;
    const work = this.chain.then(() => this.commit(body));
    this.chain = work.catch(() => {});
    try {
      return Response.json(await work);
    } catch (e) {
      const err = e as GitHubError;
      return Response.json({ error: err.message, status: err.status ?? 500 }, { status: 502 });
    }
  }

  async commit(req: CommitRequest): Promise<CommitResponse> {
    const gh = vaultFor(this.env);
    if (this.env.VAULT_BRANCH && this.env.VAULT_BRANCH !== 'main') await gh.ensureBranch('main');
    if (req.jobId) {
      const prior = await gh.findCommitByTrailer('Job-Id', req.jobId);
      if (prior) return { oid: prior, results: req.ops.map((o) => ({ path: o.path, status: 'skipped', reason: 'already committed' })), already: true };
    }
    const trailers = [req.captureId ? `Capture-Id: ${req.captureId}` : '', req.jobId ? `Job-Id: ${req.jobId}` : ''].filter(Boolean).join('\n');
    const message = trailers ? `${req.message}\n\n${trailers}` : req.message;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      const head = await gh.head();
      const current = await gh.readMany([...new Set(req.ops.map((o) => o.path))], head);
      const additions: Array<{ path: string; contents: string }> = [];
      const deletions: Array<{ path: string }> = [];
      const results: ApplyResult[] = [];
      const staged = new Map<string, { text: string; sha: string } | null>(current);
      for (const op of req.ops) {
        const { contents, result } = applyOp(op, staged.get(op.path) ?? null);
        results.push(result);
        if (contents === undefined) continue;
        if (contents === null) {
          deletions.push({ path: op.path });
          staged.set(op.path, null);
        } else {
          additions.push({ path: op.path, contents });
          staged.set(op.path, { text: contents, sha: 'staged' });
        }
      }
      // later ops on the same path win
      const dedupe = new Map(additions.map((a) => [a.path, a]));
      if (dedupe.size === 0 && deletions.length === 0) return { oid: null, results };
      try {
        const { oid } = await gh.commit({ message, additions: [...dedupe.values()], deletions, expectedHeadOid: head });
        return { oid, results };
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message ?? '';
        if (/expected.*head|STALE_DATA|was updated|base branch/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1) + Math.random() * 250));
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('vault commit: head kept moving');
  }
}

/** Convenience for routes/tools: commit through the single writer. */
export async function vaultCommit(env: Env, req: CommitRequest): Promise<CommitResponse> {
  const stub = env.VAULT_WRITER.get(env.VAULT_WRITER.idFromName('main'));
  const res = await stub.fetch(new Request('https://do/commit', { method: 'POST', body: JSON.stringify(req), headers: { 'content-type': 'application/json' } }));
  const body = (await res.json()) as CommitResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `vault commit failed (${res.status})`);
  return body;
}
