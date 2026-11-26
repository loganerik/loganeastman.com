// Bearer tokens for agents: `lem_<40 chars>`, stored as sha256(pepper + token), scoped.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { one, run, now } from '../db';

export const SCOPES = ['inbox:read', 'inbox:write', 'records:read', 'records:write', 'media:write'] as const;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'lem_' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export async function hashToken(token: string, pepper: string): Promise<string> {
  return sha256Hex(pepper + token);
}

/** Accepts either an owner Access session or a valid agent bearer token with the given scopes. */
export function requireScopes(...scopes: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const existing = c.get('principal');
    if (existing?.kind === 'owner') return next();
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token.startsWith('lem_')) return c.json({ error: 'bearer token required' }, 401);
    const hash = await hashToken(token, c.env.TOKEN_PEPPER ?? '');
    const row = await one<{ id: string; name: string; scopes: string; revoked_at: string | null }>(c.env.DB, 'SELECT id, name, scopes, revoked_at FROM agent_tokens WHERE token_hash = ?', hash);
    if (!row || row.revoked_at) return c.json({ error: 'invalid token' }, 401);
    const have = row.scopes.split(',').map((s) => s.trim());
    const missing = scopes.filter((s) => !have.includes(s) && !have.includes('*'));
    if (missing.length) return c.json({ error: `missing scopes: ${missing.join(', ')}` }, 403);
    c.set('principal', { kind: 'agent', id: row.id, name: row.name, scopes: have });
    c.executionCtx.waitUntil(run(c.env.DB, 'UPDATE agent_tokens SET last_used_at = ? WHERE id = ?', now(), row.id));
    return next();
  };
}
