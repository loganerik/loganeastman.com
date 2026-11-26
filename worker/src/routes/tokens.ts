// Owner mints and revokes agent bearer tokens. The token is shown once; only its hash is stored.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';
import { newToken, hashToken, SCOPES } from '../auth/tokens';
import { all, run, now } from '../db';
import { newId } from '@lem/vault-core';

export const tokens = new Hono<AppEnv>();

tokens.get('/api/tokens', requireOwner, async (c) => c.json({ tokens: await all(c.env.DB, 'SELECT id, name, scopes, last_used_at, created_at, revoked_at FROM agent_tokens ORDER BY created_at DESC'), scopes: SCOPES }));

tokens.post('/api/tokens', requireOwner, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; scopes?: string[] };
  const name = (body.name ?? '').trim().slice(0, 60) || 'agent';
  const scopes = (body.scopes?.length ? body.scopes : [...SCOPES]).filter((s) => (SCOPES as readonly string[]).includes(s) || s === '*');
  if (!c.env.TOKEN_PEPPER) return c.json({ error: 'TOKEN_PEPPER secret is not set' }, 500);
  const token = newToken();
  const id = newId('tok');
  await run(c.env.DB, 'INSERT INTO agent_tokens (id, name, token_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)', id, name, await hashToken(token, c.env.TOKEN_PEPPER), scopes.join(','), now());
  return c.json({ id, name, scopes, token, note: 'Store this now; it is not shown again.' }, 201);
});

tokens.delete('/api/tokens/:id', requireOwner, async (c) => {
  await run(c.env.DB, 'UPDATE agent_tokens SET revoked_at = ? WHERE id = ?', now(), c.req.param('id'));
  return c.json({ ok: true });
});
