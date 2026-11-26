export const now = (): string => new Date().toISOString();

export async function one<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...binds).first<T>()) ?? null;
}
export async function all<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...binds).all<T>()).results;
}
export async function run(db: D1Database, sql: string, ...binds: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...binds).run();
}
export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
