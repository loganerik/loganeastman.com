export class ProviderError extends Error {
  constructor(message: string, public status: number, public retryable: boolean, public retryAfterMs?: number) {
    super(message);
  }
}

export interface FetchLike { (input: string, init?: RequestInit): Promise<Response> }

/** fetch JSON with a timeout; 429/5xx are retryable, other 4xx are not. */
export async function getJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 10_000);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal });
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0) * 1000 || undefined;
      throw new ProviderError(`${new URL(url).host} ${res.status}`, res.status, res.status === 429 || res.status >= 500, retryAfter);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
