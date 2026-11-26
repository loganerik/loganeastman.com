// MCP over Streamable HTTP, stateless: one request, one response. Every tool in the registry is exposed,
// scoped by the bearer token that authenticated the request.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Env, Principal } from '../env';
import { listTools, callTool, ToolError } from '../tools';

export async function handleMcp(req: Request, env: Env, principal: Principal): Promise<Response> {
  const server = new McpServer({ name: 'loganeastman', version: '0.1.0' }, { instructions: 'Tools for organizing the owner\'s inbox and records. Read with inbox_list / inbox_get / records_search, write with capture_organize / records_link / item_enrich, ask with owner_ask. Never rewrite the owner\'s "why" text.' });
  for (const t of listTools()) {
    if (principal.kind === 'agent' && !t.scopes.every((s) => principal.scopes.includes(s) || principal.scopes.includes('*'))) continue;
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: (t.input as unknown as z.ZodObject<z.ZodRawShape>).shape ?? {} },
      async (input: unknown) => {
        try {
          const out = await callTool({ env, principal }, t.name, input);
          return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out as Record<string, unknown> };
        } catch (e) {
          return { isError: true, content: [{ type: 'text', text: e instanceof ToolError ? e.message : `error: ${(e as Error).message}` }] };
        }
      },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
