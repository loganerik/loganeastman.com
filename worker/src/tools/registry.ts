// One registry; three surfaces (MCP, REST, built-in processor). Every call is validated and audited.
import { z } from 'zod';
import type { Env, Principal } from '../env';
import { run, now } from '../db';

export interface ToolCtx { env: Env; principal: Principal; fetchImpl?: typeof fetch }
export interface ToolDef<I = unknown, O = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  scopes: string[];
  handler(ctx: ToolCtx, input: I): Promise<O>;
}

const registry = new Map<string, ToolDef<any, any>>();
export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  registry.set(def.name, def);
  return def;
}
export function listTools(): ToolDef[] {
  return [...registry.values()];
}
export function getTool(name: string): ToolDef | undefined {
  return registry.get(name);
}

export class ToolError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function callTool(ctx: ToolCtx, name: string, rawInput: unknown): Promise<unknown> {
  const tool = registry.get(name);
  if (!tool) throw new ToolError(`unknown tool: ${name}`, 404);
  if (ctx.principal.kind === 'agent') {
    const missing = tool.scopes.filter((s) => !ctx.principal.kind || (ctx.principal.kind === 'agent' && !ctx.principal.scopes.includes(s) && !ctx.principal.scopes.includes('*')));
    if (missing.length) throw new ToolError(`missing scopes: ${missing.join(', ')}`, 403);
  }
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new ToolError(z.prettifyError(parsed.error), 400);
  const who = ctx.principal.kind === 'owner' ? `owner:${ctx.principal.email}` : ctx.principal.kind === 'agent' ? `agent:${ctx.principal.name}` : 'builtin';
  try {
    const out = await tool.handler(ctx, parsed.data);
    await run(ctx.env.DB, 'INSERT INTO audit (at, principal, tool, input_json, output_json, ok) VALUES (?, ?, ?, ?, ?, 1)', now(), who, name, JSON.stringify(parsed.data).slice(0, 4000), JSON.stringify(out ?? null).slice(0, 4000)).catch(() => {});
    return out;
  } catch (e) {
    await run(ctx.env.DB, 'INSERT INTO audit (at, principal, tool, input_json, output_json, ok) VALUES (?, ?, ?, ?, ?, 0)', now(), who, name, JSON.stringify(parsed.data).slice(0, 4000), JSON.stringify({ error: (e as Error).message }), ).catch(() => {});
    throw e;
  }
}
