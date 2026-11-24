import catalog from '../../data/wishlist.json';

const ids = new Set(catalog.items.map(item => item.id));
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' }
});

// An item has one owner. Only the buyer's browser has its random release key.
export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return reply({}, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({}, 403);
  let input;
  try { input = await request.json(); } catch { return reply({}, 400); }
  if (!input || !ids.has(input.id) || !['check', 'claim', 'release'].includes(input.action)
      || !/^[0-9a-f-]{36}$/.test(input.key)) return reply({}, 400);
  const db = env.WISHLIST_DB;
  if (!db) return reply({}, 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.key));
  const owner = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const read = db.prepare('SELECT owner FROM wishlist_claims WHERE item = ?').bind(input.id);
  const batch = [db.prepare('CREATE TABLE IF NOT EXISTS wishlist_claims (item TEXT PRIMARY KEY, owner TEXT NOT NULL)')];
  if (input.action === 'claim') {
    batch.push(db.prepare('INSERT INTO wishlist_claims (item, owner) VALUES (?, ?) ON CONFLICT(item) DO NOTHING').bind(input.id, owner));
  } else if (input.action === 'release') {
    batch.push(db.prepare('DELETE FROM wishlist_claims WHERE item = ? AND owner = ?').bind(input.id, owner));
  }
  try {
    batch.push(read);
    const result = await db.batch(batch);
    const row = result[result.length - 1].results[0];
    return reply({ state: !row ? 'available' : row.owner === owner ? 'yours' : 'taken' });
  } catch { return reply({}, 503); }
}
