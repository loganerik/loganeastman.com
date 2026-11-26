// Local stand-ins for TMDB and GitHub so the whole capture pipeline can run without credentials.
// GitHub state is an in-memory copy of the vault folder; GET /github/_state dumps it, POST /github/_reset reloads.
import http from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const VAULT = process.env.VAULT_PATH ?? path.resolve(process.cwd(), '../../vault');
const PORT = Number(process.env.PORT ?? 9797);

let files = new Map();
let head = 'a'.repeat(40);
let commits = [];
function load() {
  files = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e.startsWith('.') || e === 'attachments') continue;
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.md') || e.endsWith('.json')) files.set(path.relative(VAULT, p), readFileSync(p, 'utf8'));
    }
  };
  walk(VAULT);
  commits = [];
  head = sha();
}
const sha = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join('');
const blobSha = (s) => 'b' + [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16).padStart(39, '0');

// --- fixtures: a real-shaped TMDB movie ---
const MOVIES = {
  549509: { id: 549509, title: 'The Brutalist', release_date: '2024-12-20', overview: 'When a visionary architect and his wife flee post-war Europe in 1947 to rebuild their legacy and witness the birth of modern United States, their lives are changed forever by a mysterious and wealthy client.', runtime: 215, popularity: 80.1, poster_path: '/brutalist.jpg', genres: [{ name: 'Drama' }], imdb_id: 'tt8999762',
    credits: { crew: [{ job: 'Director', name: 'Brady Corbet' }, { job: 'Writer', name: 'Mona Fastvold' }], cast: [{ name: 'Adrien Brody', order: 0 }, { name: 'Felicity Jones', order: 1 }, { name: 'Guy Pearce', order: 2 }, { name: 'Joe Alwyn', order: 3 }, { name: 'Raffey Cassidy', order: 4 }, { name: 'Stacy Martin', order: 5 }] },
    release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ type: 1, release_date: '2024-09-01T00:00:00Z' }, { type: 2, release_date: '2024-12-20T00:00:00Z' }, { type: 3, release_date: '2025-01-24T00:00:00Z' }, { type: 4, release_date: '2025-03-18T00:00:00Z' }] }, { iso_3166_1: 'GB', release_dates: [{ type: 3, release_date: '2025-01-24T00:00:00Z' }] }] },
    external_ids: { imdb_id: 'tt8999762' }, images: { logos: [{ file_path: '/brutalist-logo.png', iso_639_1: 'en', vote_average: 5 }] } },
  426063: { id: 426063, title: 'Nosferatu', release_date: '2024-12-25', overview: 'A gothic tale of obsession.', runtime: 132, popularity: 60, poster_path: '/nos24.jpg', genres: [{ name: 'Horror' }], credits: { crew: [{ job: 'Director', name: 'Robert Eggers' }], cast: [] }, release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2024-12-25T00:00:00Z' }] }] }, external_ids: {}, images: { logos: [] } },
  653: { id: 653, title: 'Nosferatu', release_date: '1922-02-16', overview: 'Silent.', runtime: 94, popularity: 25, poster_path: '/nos22.jpg', genres: [{ name: 'Horror' }], credits: { crew: [{ job: 'Director', name: 'F.W. Murnau' }], cast: [] }, release_dates: { results: [] }, external_ids: {}, images: { logos: [] } },
  2102: { id: 2102, title: 'Nosferatu the Vampyre', release_date: '1979-01-17', overview: 'Herzog.', runtime: 107, popularity: 10, poster_path: '/nos79.jpg', genres: [{ name: 'Horror' }], credits: { crew: [], cast: [] }, release_dates: { results: [] }, external_ids: {}, images: { logos: [] } },
  1100000: { id: 1100000, title: 'Project Hail Mary', release_date: '2026-03-20', overview: 'A lone astronaut must save the earth.', runtime: 0, popularity: 90, poster_path: '/phm.jpg', genres: [{ name: 'Science Fiction' }], credits: { crew: [{ job: 'Director', name: 'Phil Lord' }, { job: 'Director', name: 'Christopher Miller' }], cast: [{ name: 'Ryan Gosling', order: 0 }] }, release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2027-03-20T00:00:00Z' }] }] }, external_ids: { imdb_id: 'tt12042730' }, images: { logos: [] } },
};
const PAGES = {
  'letterboxd.com/film/the-brutalist/': `<html><head><title>The Brutalist (2024) directed by Brady Corbet • Reviews, film + cast • Letterboxd</title><meta property="og:title" content="The Brutalist (2024)"><meta property="og:type" content="video.movie"></head></html>`,
  'letterboxd.com/film/nosferatu/': `<html><head><title>Nosferatu • Letterboxd</title><meta property="og:title" content="Nosferatu"></head></html>`,
};
// a 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

load();
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  // ---- fake web pages ----
  if (p.startsWith('/page/')) { const k = p.slice(6); res.writeHead(PAGES[k] ? 200 : 404, { 'content-type': 'text/html' }); return res.end(PAGES[k] ?? 'nope'); }
  // ---- images ----
  if (p.startsWith('/img/')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
  // ---- TMDB ----
  if (p === '/tmdb/3/search/movie') {
    const q = (u.searchParams.get('query') ?? '').toLowerCase();
    const year = u.searchParams.get('year');
    const hits = Object.values(MOVIES).filter((m) => m.title.toLowerCase().includes(q)).filter((m) => !year || m.release_date.startsWith(year)).sort((a, b) => b.popularity - a.popularity);
    return json(res, { results: hits.map((m) => ({ id: m.id, title: m.title, release_date: m.release_date, popularity: m.popularity, overview: m.overview, poster_path: m.poster_path })) });
  }
  if (p.startsWith('/tmdb/3/find/')) { const imdb = p.split('/').pop(); const m = Object.values(MOVIES).find((x) => x.imdb_id === imdb || x.external_ids?.imdb_id === imdb); return json(res, { movie_results: m ? [{ id: m.id }] : [], tv_results: [] }); }
  if (p.startsWith('/tmdb/3/movie/')) { const m = MOVIES[Number(p.split('/').pop())]; return m ? json(res, m) : json(res, { status_message: 'not found' }, 404); }
  // ---- GitHub ----
  if (p === '/github/_state') return json(res, { head, commits, files: Object.fromEntries(files) });
  if (p === '/github/_reset') { load(); return json(res, { ok: true }); }
  if (p === '/github/graphql') {
    const { query, variables } = JSON.parse(await readBody(req));
    if (query.includes('ref(qualifiedName')) return json(res, { data: { repository: { ref: { target: { oid: head } } } } });
    if (query.includes('createCommitOnBranch')) {
      const inp = variables.in;
      if (inp.expectedHeadOid !== head) return json(res, { errors: [{ message: 'Expected branch to point to "' + head + '" but it did not', type: 'STALE_DATA' }] });
      for (const a of inp.fileChanges.additions ?? []) files.set(a.path, Buffer.from(a.contents, 'base64').toString('utf8'));
      for (const d of inp.fileChanges.deletions ?? []) files.delete(d.path);
      head = sha();
      commits.unshift({ sha: head, commit: { message: [inp.message.headline, inp.message.body].filter(Boolean).join('\n\n') }, files: [...(inp.fileChanges.additions ?? []).map((a) => a.path)] });
      return json(res, { data: { createCommitOnBranch: { commit: { oid: head } } } });
    }
    // object(expression: "ref:path") batch reads
    const out = {};
    for (const m of query.matchAll(/(f\d+): object\(expression: "([^"]+)"\)/g)) {
      const [, key, expr] = m;
      const filePath = expr.slice(expr.indexOf(':') + 1);
      const text = files.get(filePath);
      out[key] = text === undefined ? null : { text, oid: blobSha(text) };
    }
    return json(res, { data: { repository: out } });
  }
  if (/^\/github\/repos\/[^/]+\/[^/]+\/commits/.test(p)) return json(res, commits.slice(0, 50));
  if (/^\/github\/repos\/[^/]+\/[^/]+\/git\/trees\//.test(p)) return json(res, { tree: [...files.keys()].map((k) => ({ path: k, type: 'blob', sha: blobSha(files.get(k)) })), truncated: false });
  if (/^\/github\/repos\/[^/]+\/[^/]+\/dispatches$/.test(p)) { commits.dispatched = (commits.dispatched ?? 0) + 1; res.writeHead(204); return res.end(); }
  if (/^\/github\/repos\/[^/]+\/[^/]+\/git\/ref\//.test(p)) return json(res, { object: { sha: head } });
  if (/^\/github\/repos\/[^/]+\/[^/]+\/git\/refs$/.test(p)) { await readBody(req); return json(res, { ok: true }, 201); }
  json(res, { error: 'mock: no route ' + p }, 404);
}).listen(PORT, '127.0.0.1', () => console.log(`mock upstream on http://127.0.0.1:${PORT} (vault: ${VAULT}, ${files.size} files)`));
