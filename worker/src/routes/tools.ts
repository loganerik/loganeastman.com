// REST surface for the same registry MCP exposes: POST /api/tools/:name { ...input }
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireScopes } from '../auth/tokens';
import { listTools, getTool, callTool, ToolError } from '../tools';
import { z } from 'zod';

export const tools = new Hono<AppEnv>();

tools.get('/api/tools', requireScopes('inbox:read'), (c) =>
  c.json({ tools: listTools().map((t) => ({ name: t.name, description: t.description, scopes: t.scopes, input: z.toJSONSchema(t.input) })) }),
);

tools.post('/api/tools/:name', requireScopes(), async (c) => {
  const name = c.req.param('name');
  const tool = getTool(name);
  if (!tool) return c.json({ error: 'unknown tool' }, 404);
  const principal = c.get('principal');
  if (!principal) return c.json({ error: 'unauthorized' }, 401);
  try {
    const input = await c.req.json().catch(() => ({}));
    return c.json({ ok: true, result: await callTool({ env: c.env, principal }, name, input) });
  } catch (e) {
    const status = e instanceof ToolError ? e.status : 500;
    return c.json({ ok: false, error: (e as Error).message }, status as 400);
  }
});
