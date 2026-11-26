import type { Env } from '../../env';
import type { LlmProvider } from './provider';
import { OpenAIProvider } from './openai';

export function llmFor(env: Env): LlmProvider | null {
  const p = (env.LLM_PROVIDER || 'openai').toLowerCase();
  if (p === 'openai' && env.OPENAI_API_KEY) return new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL || 'gpt-5.1');
  return null;
}

export const SYSTEM_RULES = `You organize captures for a personal website. Output JSON only, matching the schema.
Hard rules: never invent facts; when unsure use null; never paraphrase or rewrite the owner's "why" sentence; prefer leaving a field empty over guessing.`;
