// Cloudflare Access: the owner signs in with an email one-time code at the edge; we only verify the JWT.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
const certCache = new Map<string, { keys: Jwk[]; at: number }>();

async function keysFor(team: string): Promise<Jwk[]> {
  const hit = certCache.get(team);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.keys;
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  certCache.set(team, { keys: body.keys, at: Date.now() });
  return body.keys;
}

function b64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
}

export async function verifyAccessJwt(token: string, team: string, aud: string): Promise<{ email: string } | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { kid: string; alg: string };
  const payload = JSON.parse(new TextDecoder().decode(b64url(p))) as { aud: string | string[]; exp: number; email?: string; iss: string };
  if (header.alg !== 'RS256') return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.exp * 1000 < Date.now()) return null;
  if (payload.iss !== `https://${team}.cloudflareaccess.com`) return null;
  const jwk = (await keysFor(team)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok || !payload.email) return null;
  return { email: payload.email };
}

/** Sets c.var.principal = owner when the Access JWT is valid for the owner's email. Does not reject. */
export const accessIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = c.env;
  if (env.ENVIRONMENT === 'dev' && env.DEV_BYPASS_ACCESS === '1') {
    c.set('principal', { kind: 'owner', email: env.OWNER_EMAIL });
    return next();
  }
  const token = c.req.header('Cf-Access-Jwt-Assertion') ?? c.req.header('cookie')?.match(/CF_Authorization=([^;]+)/)?.[1];
  if (token && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    try {
      const id = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
      if (id && id.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()) c.set('principal', { kind: 'owner', email: id.email });
    } catch {
      /* treated as anonymous */
    }
  }
  return next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const p = c.get('principal');
  if (p?.kind !== 'owner') return c.json({ error: 'owner sign-in required' }, 401);
  return next();
};
