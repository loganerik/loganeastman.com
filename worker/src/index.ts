import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { accessIdentity } from './auth/access';
import { media } from './routes/media';
import { share } from './routes/share';
import { captures } from './routes/captures';
import { tools } from './routes/tools';
import { github } from './routes/github';
import { questions } from './routes/questions';
import { tokens } from './routes/tokens';
import { records } from './routes/records';
import { publish } from './routes/publish';
import { assets } from './routes/assets';
import { handleMcp } from './mcp/server';
import { requireScopes } from './auth/tokens';
import './tools';
export { VaultWriter } from './do/VaultWriter';
export { Processor } from './do/Processor';

const app = new Hono<AppEnv>();

// www → apex, permanently
app.use('*', async (c, next) => {
  const u = new URL(c.req.url);
  if (u.hostname.startsWith('www.')) {
    u.hostname = u.hostname.slice(4);
    return c.redirect(u.toString(), 301);
  }
  return next();
});

app.use('*', accessIdentity);

app.get('/api/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT, at: new Date().toISOString() }));
app.get('/api/me', (c) => {
  const p = c.get('principal');
  if (p?.kind === 'owner') return c.json({ owner: true, email: p.email }, 200, { 'cache-control': 'no-store' });
  return c.json({ owner: false }, 401, { 'cache-control': 'no-store' });
});
// After an Access login the browser lands here; the hint lets public pages reveal owner controls.
app.get('/api/login', (c) => {
  const next = c.req.query('next') ?? '/private/';
  const p = c.get('principal');
  if (p?.kind !== 'owner') return c.json({ error: 'owner sign-in required' }, 401);
  return c.html(`<!doctype html><meta charset="utf-8"><script>try{localStorage.setItem('ownerHint','1')}catch{}location.replace(${JSON.stringify(next.startsWith('/') ? next : '/private/')})</script>`);
});

app.route('/', publish);
app.route('/', media);
app.route('/', share);
app.route('/', captures);
app.route('/', tools);
app.route('/', github);
app.route('/', questions);
app.route('/', tokens);
app.route('/', records);
app.route('/', assets);
app.all('/mcp', requireScopes(), (c) => handleMcp(c.req.raw, c.env, c.get('principal')!));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const stub = env.PROCESSOR.get(env.PROCESSOR.idFromName('main'));
    ctx.waitUntil(stub.fetch(new Request('https://do/poke', { method: 'POST', headers: { 'x-cron': event.cron } })));
  },
} satisfies ExportedHandler<Env>;
