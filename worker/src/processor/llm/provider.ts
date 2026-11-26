// Provider-agnostic structured-output call. The pipeline only ever asks for a JSON object matching a schema.
import type { z } from 'zod';

export interface StructuredArgs<T> { system: string; user: string; schema: z.ZodType<T>; name?: string; effort?: 'low' | 'medium' | 'high' }
export interface LlmProvider {
  readonly name: string;
  structured<T>(args: StructuredArgs<T>): Promise<T>;
}

export class LlmRefusal extends Error {}
