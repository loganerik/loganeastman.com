import picks from '../../data/recommendations.json';

const gifts = new Map(picks.gifts.map(gift => [gift.id, gift.name]));
const endpoint = 'https://docs.google.com/forms/d/e/1FAIpQLSdqz1irj4v6FM2viVrh75pBYX9-dht3jB1E9LdMPhcrTbxvOA/formResponse?hl=en';
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
    db.prepare('SELECT gift, visitor_name FROM gift_likes WHERE id = ?').bind(key)
  ]);
  const like = results[3].results[0];
  if (!like) return reply(429);

  const sends = await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS gift_like_sends (id TEXT PRIMARY KEY, created INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('DELETE FROM gift_like_sends WHERE id = ? AND sent = 0 AND created < ?').bind(key, now - 300),
    db.prepare('INSERT OR IGNORE INTO gift_like_sends(id,created) VALUES(?,?)').bind(key,now),
    db.prepare('SELECT sent FROM gift_like_sends WHERE id = ?').bind(key)
  ]);
  if (!sends[2].meta.changes) return sends[3].results[0]?.sent ? reply(200, true) : reply(409);

  const body = new URLSearchParams({'entry.1202967802':like.visitor_name, 'entry.529917177':like.gift});
  try {
    const result = await fetch(endpoint, {method:'POST', body});
    if (!result.ok || !(await result.text()).includes('Your response has been recorded')) {
      throw new Error('Unconfirmed response');
    }
  } catch {
    await db.prepare('DELETE FROM gift_like_sends WHERE id = ? AND sent = 0').bind(key).run();
    return reply(502);
  }
  await db.prepare('UPDATE gift_like_sends SET sent = 1 WHERE id = ?').bind(key).run();
  return reply(200, true);
}
