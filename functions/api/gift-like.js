import picks from '../../data/recommendations.json';

const gifts = new Map(picks.gifts.map(gift => [gift.id, gift.name]));
const reply = (status, sent = false) => Response.json({ sent }, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return reply(405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply(403);
  const input = await request.json().catch(() => null);
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const title = gifts.get(input?.id);
  if (!title || !name || name.length > 80 || /[\u0000-\u001f]/u.test(name) ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input?.requestId)) return reply(400);

  const db = env.WISHLIST_DB;
  if (!db) return reply(503);
  const key = input.id + '/' + input.requestId;
  const now = Math.floor(Date.now() / 1000);
  const bucket = new TextEncoder().encode(Math.floor(now / 86400) + '/' + (request.headers.get('CF-Connecting-IP') || 'local'));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bucket)), n => n.toString(16).padStart(2, '0')).join('');
  // One private inbox entry per gift and submission. Names are never served publicly.
  const results = await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS gift_likes (id TEXT PRIMARY KEY, gift TEXT NOT NULL, visitor_name TEXT NOT NULL, created INTEGER NOT NULL, bucket TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS gift_likes_bucket ON gift_likes(bucket)'),
    db.prepare('INSERT OR IGNORE INTO gift_likes(id,gift,visitor_name,created,bucket) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM gift_likes WHERE bucket = ?) < 30').bind(key,title,name,now,hash,hash),
    db.prepare('SELECT id FROM gift_likes WHERE id = ?').bind(key)
  ]);
  return results[3].results.length ? reply(200, true) : reply(429);
}
