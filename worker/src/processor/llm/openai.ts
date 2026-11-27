import { z } from 'zod';
import type { LlmProvider, StructuredArgs } from './provider';
import { LlmRefusal } from './provider';

export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  private fetchImpl: typeof fetch;
  // workerd refuses a bare `fetch` called as a method (Illegal invocation): keep a wrapper, call it as a plain function
  constructor(private apiKey: string, private model: string, fetchImpl?: typeof fetch) { this.fetchImpl = fetchImpl ?? ((i, o) => fetch(i, o)); }

  async structured<T>(args: StructuredArgs<T>): Promise<T> {
    const schema = z.toJSONSchema(args.schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
    strictify(schema);
    const call = this.fetchImpl;
    const res = await call('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        instructions: args.system,
        input: args.user,
        reasoning: { effort: args.effort ?? 'low' },
        text: { format: { type: 'json_schema', name: args.name ?? 'result', schema, strict: true } },
        max_output_tokens: 2000,
        store: false,
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>; output_text?: string };
    let text = body.output_text;
    if (!text) {
      for (const o of body.output ?? []) {
        for (const c of o.content ?? []) {
          if (c.type === 'refusal') throw new LlmRefusal(c.refusal ?? 'refused');
          if (c.type === 'output_text' && c.text) text = c.text;
        }
      }
    }
    if (!text) throw new Error('openai: empty output');
    return args.schema.parse(JSON.parse(text));
  }
}

/** OpenAI strict mode wants additionalProperties:false and every property required (optionals become nullable). */
function strictify(node: Record<string, unknown>): void {
  if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
    const props = node.properties as Record<string, Record<string, unknown>>;
    node.additionalProperties = false;
    node.required = Object.keys(props);
    for (const p of Object.values(props)) strictify(p);
  }
  if (node.items && typeof node.items === 'object') strictify(node.items as Record<string, unknown>);
  for (const k of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(node[k])) for (const s of node[k] as Record<string, unknown>[]) strictify(s);
}
