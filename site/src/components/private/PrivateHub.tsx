// The private area: a small home with what needs you, the inbox, your drafts and people up front, the whole
// library behind a search, and settings as forms. The back-end bits (conflicts, suggestions, agents, raw YAML)
// sit under More.
import { useEffect, useState } from 'preact/hooks';
import { api, when, publicUrl, humanKind, getConfig, listRecords, type Capture, type RecordSummary, type Question, type Config as Cfg } from './api';
import VisibilityPill from './ui/VisibilityPill';
import DeleteButton from './ui/DeleteButton';
import { toast } from './ui/toast';
import CollectionsForm from './config/CollectionsForm';
import ListTypesForm from './config/ListTypesForm';
import SiteForm from './config/SiteForm';

type Tab = 'home' | 'inbox' | 'drafts' | 'people' | 'library' | 'settings' | 'conflicts' | 'suggestions' | 'tokens' | 'config';
const MAIN: Array<[Tab, string]> = [['home', 'Home'], ['inbox', 'Inbox'], ['drafts', 'Drafts'], ['people', 'People'], ['library', 'Library']];
const MORE: Array<[Tab, string]> = [['settings', 'Settings'], ['conflicts', 'Conflicts'], ['suggestions', 'Suggestions'], ['tokens', 'Agents'], ['config', 'Advanced']];
const TITLES: Record<Tab, string> = { home: 'Private', inbox: 'Inbox', drafts: 'Drafts', people: 'People & tags', library: 'Library', settings: 'Settings', conflicts: 'Conflicts', suggestions: 'Suggestions', tokens: 'Agents', config: 'Advanced' };
export interface Counts { inbox: number; questions: number; drafts: number; private: number; conflicts: number; suggestions: number; by_type: Record<string, number> }

export default function PrivateHub({ initialTab = 'home' }: { initialTab?: Tab }) {
  useEffect(() => { try { localStorage.setItem('ownerHint', '1'); sessionStorage.removeItem('owner'); } catch { /* ignore */ } }, []);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab) || initialTab);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => { getConfig().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    const u = new URL(location.href);
    if (tab === 'home') u.searchParams.delete('tab'); else u.searchParams.set('tab', tab);
    history.replaceState(history.state, '', u.toString());
  }, [tab]);
  useEffect(() => {
    let alive = true;
    const tick = () => api<Counts>('/api/counts').then((c) => alive && setCounts(c)).catch(() => {});
    tick();
    const t = setInterval(() => document.visibilityState === 'visible' && tick(), 15000);
    return () => { alive = false; clearInterval(t); };
  }, [tab]);
  const inMore = MORE.some(([k]) => k === tab);
  return (
    <div class="hub">
      <header class="hub__head">
        <div class="hub__top">
          <h1 class="hub__title">{TITLES[tab]}</h1>
          <span class="chips">
            <button type="button" class="btn btn--soft" data-compose="feed">+ New</button>
            <button type="button" class="btn" onClick={() => { try { localStorage.removeItem('ownerHint'); sessionStorage.removeItem('owner'); } catch { /* ignore */ } location.href = '/cdn-cgi/access/logout'; }}>Sign out</button>
          </span>
        </div>
        <nav class="mono hub__tabs" aria-label="Private sections">
          {MAIN.map(([k, label]) => (
            <button type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
              {label}{k === 'inbox' && counts && counts.inbox + counts.questions > 0 && <sup> {counts.inbox + counts.questions}</sup>}{k === 'drafts' && counts && counts.drafts > 0 && <sup> {counts.drafts}</sup>}
            </button>
          ))}
          <details class="hub__more" open={inMore || undefined}>
            <summary aria-current={inMore ? 'page' : undefined}>More{counts && counts.conflicts > 0 && <sup class="warn"> {counts.conflicts}</sup>}</summary>
            <div class="hub__more-list">{MORE.map(([k, label]) => <button type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{label}{k === 'conflicts' && counts && counts.conflicts > 0 && <sup class="warn"> {counts.conflicts}</sup>}{k === 'suggestions' && counts && counts.suggestions > 0 && <sup> {counts.suggestions}</sup>}</button>)}</div>
          </details>
        </nav>
      </header>
      {tab === 'home' && <Home counts={counts} cfg={cfg} go={setTab} />}
      {tab === 'inbox' && <Inbox />}
      {tab === 'drafts' && <Library cfg={cfg} fixed={{ status: 'draft' }} empty="No drafts. Everything you have written is out there." />}
      {tab === 'people' && <People cfg={cfg} />}
      {tab === 'library' && <Library cfg={cfg} />}
      {tab === 'settings' && <Settings />}
      {tab === 'conflicts' && <Conflicts />}
      {tab === 'suggestions' && <Suggestions />}
      {tab === 'tokens' && <Tokens />}
      {tab === 'config' && <Config />}
    </div>
  );
}

function Home({ counts, cfg, go }: { counts: Counts | null; cfg: Cfg | null; go: (t: Tab) => void }) {
  const { data: recent } = useLoader(() => listRecords({ limit: 8 }), []);
  const { data: qs, reload } = useLoader(() => api<{ questions: Question[] }>('/api/questions'), [], 15000);
  const tiles: Array<[string, number | undefined, Tab, string?]> = [
    ['In the inbox', counts?.inbox, 'inbox'], ['Questions for you', counts?.questions, 'inbox', 'warn'], ['Drafts', counts?.drafts, 'drafts'],
    ['Private', counts?.private, 'library'], ['Conflicts', counts?.conflicts, 'conflicts', 'warn'], ['Suggestions', counts?.suggestions, 'suggestions'],
  ];
  return (
    <section class="home">
      <ul class="home__tiles">
        {tiles.map(([label, n, t, tone]) => (
          <li key={label}><button type="button" class={`stepped home__tile ${tone && n ? 'home__tile--warn' : ''}`} onClick={() => go(t)}><span class="home__n">{n ?? '…'}</span><span class="mono muted home__label">{label}</span></button></li>
        ))}
      </ul>
      {qs && qs.questions.length > 0 && (
        <div class="home__block"><div class="rule-label"><span>Waiting on you</span></div>{qs.questions.map((q) => <Ask key={q.id} q={q} onDone={reload} />)}</div>
      )}
      <div class="home__block">
        <div class="rule-label"><span>Recently touched</span></div>
        {recent && <Rows records={recent.records} cfg={cfg} empty="Nothing yet." />}
      </div>
      {counts && (
        <p class="mono muted home__totals">{Object.entries(counts.by_type).filter(([t]) => t !== 'list-entry').map(([t, n]) => `${n} ${humanKind({ type: t }, cfg).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}</p>
      )}
    </section>
  );
}

/** One record, the way the owner thinks of it: title, what it is, when, who sees it, edit, delete. */
function Rows({ records, cfg, empty }: { records: RecordSummary[]; cfg: Cfg | null; empty: string }) {
  if (!records.length) return <p class="muted">{empty}</p>;
  return (
    <ul class="recs">
      {records.map((r) => {
        const url = r.visibility === 'public' && !r.draft ? publicUrl(r) : null;
        return (
          <li key={r.id} data-article={r.id}>
            <div class="recs__main">
              <a class="recs__title" href={`/private/edit/?id=${r.id}`}>{r.title ?? (r.type === 'feed' && r.excerpt ? r.excerpt.slice(0, 70) + (r.excerpt.length > 70 ? '…' : '') : r.path.split('/').pop())}</a>
              <span class="mono muted">{humanKind(r, cfg)}{r.draft ? ' · draft' : ''}{r.conflict ? ' · conflict' : ''}{r.date ? ' · ' + when(String(r.date), { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</span>
            </div>
            <div class="chips recs__tools">
              <VisibilityPill id={r.id} value={r.visibility ?? 'public'} type={r.type} />
              {url && <a class="btn btn--small" href={url}>View</a>}
              <a class="btn btn--soft btn--small" href={`/private/edit/?id=${r.id}`}>Edit</a>
              <DeleteButton rec={{ id: r.id, title: r.title, type: r.type }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const TYPE_CHIPS: Array<[string, string]> = [['', 'Everything'], ['writing', 'Writing'], ['feed', 'Thoughts'], ['list', 'Lists'], ['item', 'Things'], ['review', 'Reviews'], ['person', 'People'], ['tag', 'Tags']];
function Library({ cfg, fixed = {}, empty = 'Nothing here.' }: { cfg: Cfg | null; fixed?: Record<string, string>; empty?: string }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [vis, setVis] = useState<'' | 'public' | 'private' | 'draft'>('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<RecordSummary[]>([]);
  const [more, setMore] = useState(false);
  const PAGE = 50;
  useEffect(() => { setPage(0); }, [q, type, vis]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      listRecords({ q: q.trim() || undefined, type: type || undefined, visibility: vis === 'public' || vis === 'private' ? vis : undefined, status: vis === 'draft' ? 'draft' : undefined, limit: PAGE, offset: page * PAGE, ...fixed })
        .then((d) => { if (!alive) return; setRows((r) => (page ? [...r, ...d.records] : d.records)); setMore(d.records.length === PAGE); })
        .catch(() => {});
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q, type, vis, page]);
  const grouped = new Map<string, RecordSummary[]>();
  for (const r of rows) { const k = humanKind(r, cfg); grouped.set(k, [...(grouped.get(k) ?? []), r]); }
  return (
    <section class="library">
      <input class="search" placeholder="Search titles and text…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips library__chips">
        {!fixed.type && TYPE_CHIPS.map(([v, l]) => <button type="button" class="chip chip--small" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        {!fixed.status && (
          <span class="seg seg--small">
            {([['', 'All'], ['public', 'Public'], ['private', 'Private'], ['draft', 'Drafts']] as const).map(([v, l]) => <button type="button" class="seg__b" aria-pressed={vis === v} onClick={() => setVis(v)}>{l}</button>)}
          </span>
        )}
      </div>
      {rows.length === 0 && <p class="muted">{empty}</p>}
      {[...grouped.entries()].map(([k, rs]) => (
        <div class="library__group" key={k}>
          {grouped.size > 1 && <div class="rule-label"><span>{k} · {rs.length}</span></div>}
          <Rows records={rs} cfg={cfg} empty="" />
        </div>
      ))}
      {more && <p><button type="button" class="btn" onClick={() => setPage((p) => p + 1)}>Show more</button></p>}
    </section>
  );
}

function People({ cfg }: { cfg: Cfg | null }) {
  const { data } = useLoader(async () => { const [{ people }, { tags }] = await Promise.all([api<{ people: RecordSummary[] }>('/api/index/people'), api<{ tags: Array<{ tag: string; count: number; private: boolean }> }>('/api/index/tags')]); return { people, tags }; });
  return (
    <section class="two">
      <div>
        <div class="rule-label"><span>People</span></div>
        <p class="muted">People you mention. Private unless you make one public; the site shows names, aliases or nothing per your settings.</p>
        {data && <Rows records={data.people} cfg={cfg} empty="No people yet. Type @Name in anything you write." />}
        <p class="chips"><button type="button" class="btn btn--soft" data-compose="person">+ Add a person</button></p>
      </div>
      <div>
        <div class="rule-label"><span>Tags</span></div>
        <ul class="tags">{data?.tags.map((t) => <li key={t.tag}><a href={t.private ? '#' : `/tags/${t.tag}/`} class={t.private ? 'muted' : ''}>{t.private ? '🔒 ' : '#'}{t.tag.replace(/^private\//, '')}</a> <span class="mono muted">{t.count}</span></li>)}</ul>
        {data && data.tags.length === 0 && <p class="muted">No tags yet. Type #tag in anything you write.</p>}
      </div>
    </section>
  );
}

function Settings() {
  return (
    <section class="settings">
      <div class="rule-label"><span>Writing collections</span></div>
      <CollectionsForm />
      <div class="rule-label settings__rule"><span>Kinds of lists</span></div>
      <ListTypesForm />
      <div class="rule-label settings__rule"><span>Site</span></div>
      <SiteForm />
    </section>
  );
}

function useLoader<T>(load: () => Promise<T>, deps: unknown[] = [], every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d)).catch((e) => alive && setErr((e as Error).message));
    const t = every ? setInterval(() => document.visibilityState === 'visible' && load().then((d) => alive && setData(d)).catch(() => {}), every) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [...deps, n]);
  return { data, err, reload: () => setN((x) => x + 1) };
}

function Inbox() {
  const { data, err, reload } = useLoader(async () => {
    const [{ captures }, { questions }] = await Promise.all([api<{ captures: Capture[] }>('/api/captures?status=all&limit=80'), api<{ questions: Question[] }>('/api/questions')]);
    return { captures, questions: new Map(questions.map((q) => [q.capture_id, q])) };
  }, [], 8000);
  const [form, setForm] = useState({ url: '', why: '', intent: '', priv: false });
  const [busy, setBusy] = useState(false);
  const save = async (e: Event) => {
    e.preventDefault();
    if (!form.url && !form.why) return;
    setBusy(true);
    try {
      await api('/api/captures', { method: 'POST', body: JSON.stringify({ client_id: crypto.randomUUID(), url: form.url, why: form.why, intent: form.intent, visibility: form.priv ? 'private' : 'public' }) });
      setForm({ url: '', why: '', intent: '', priv: false });
      reload();
    } finally { setBusy(false); }
  };
  const act = async (path: string, body?: unknown) => { await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); reload(); };
  return (
    <section>
      <form class="quick" onSubmit={save}>
        <input placeholder="Paste a link…" inputMode="url" value={form.url} onInput={(e) => setForm({ ...form, url: (e.target as HTMLInputElement).value })} aria-label="Link" />
        <input placeholder="Why I'm interested (one sentence)" value={form.why} onInput={(e) => setForm({ ...form, why: (e.target as HTMLInputElement).value })} aria-label="Why" />
        <select value={form.intent} onChange={(e) => setForm({ ...form, intent: (e.target as HTMLSelectElement).value })} aria-label="File as">
          <option value="">Let the agent decide</option><option value="list">List</option><option value="feed">Feed</option><option value="review">Review</option><option value="writing">Writing</option>
        </select>
        <label class="mono"><input type="checkbox" checked={form.priv} onChange={(e) => setForm({ ...form, priv: (e.target as HTMLInputElement).checked })} /> Private</label>
        <button class="btn btn--solid" disabled={busy}>Save</button>
      </form>
      {err && <p class="err mono">{err}</p>}
      {data && data.captures.length === 0 && <p class="muted">Nothing in the inbox.</p>}
      <ul class="captures">
        {data?.captures.map((c) => {
          const q = data.questions.get(c.id);
          const r = c.result;
          return (
            <li class="cap" key={c.id}>
              <div class="cap__row"><span class={`mono status status--${c.status}`}>{c.status.replace('_', ' ')}</span><span class="mono muted">{when(c.created_at)} · {c.visibility}{c.intent ? ` · ${c.intent}` : ''}</span></div>
              <p class="cap__title">{c.title || c.url || c.text || '(empty)'}</p>
              {c.why && <p class="cap__why">{c.why}</p>}
              {c.url && c.title && <p class="mono muted cap__url">{c.url}</p>}
              {c.error && <p class="cap__err mono">{c.error}</p>}
              {r?.item && <p class="mono">→ <a href={r.item.url ?? '#'}>{r.item.path}</a>{r.records?.length ? ' · ' + r.records.map((x) => x.path).join(', ') : ''}</p>}
              {!r?.item && r?.records?.length ? <p class="mono">→ {r.records.map((x) => x.path).join(', ')}</p> : null}
              {q && <Ask q={q} onDone={reload} />}
              <p class="cap__actions mono">
                {c.status !== 'done' && c.status !== 'processing' && <button onClick={() => act(`/api/captures/${c.id}/retry`)}>Retry</button>}
                {c.status !== 'done' && <button onClick={() => act(`/api/captures/${c.id}/visibility`, { visibility: c.visibility === 'public' ? 'private' : 'public' })}>{c.visibility === 'public' ? 'Make private' : 'Make public'}</button>}
                {c.status !== 'done' && c.status !== 'cancelled' && <button onClick={async () => { await api(`/api/captures/${c.id}`, { method: 'DELETE' }); reload(); }}>Cancel</button>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Ask({ q, onDone }: { q: Question; onDone: () => void }) {
  const [text, setText] = useState('');
  const options = JSON.parse(q.options_json || '[]') as string[];
  const answer = async (a: string) => { await api(`/api/questions/${q.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: a }) }); onDone(); };
  return (
    <form class="ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) answer(text.trim()); }}>
      <p class="ask__q">{q.question}</p>
      {options.map((o) => <button type="button" class="btn" onClick={() => answer(o)}>{o.replace(/\s*\[tmdb:[^\]]+\]/, '')}</button>)}
      <input placeholder="Or type an answer" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      <button class="btn btn--solid">Answer</button>
    </form>
  );
}

function Conflicts() {
  const { data, reload } = useLoader(() => api<{ records: RecordSummary[] }>('/api/records?conflict=1'));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      {data && data.records.length === 0 && <p class="muted">No conflicts. Obsidian and the site agree.</p>}
      <ul class="recs">
        {data?.records.map((r) => (
          <li key={r.id}>
            <a class="recs__title" href="#" onClick={(e) => { e.preventDefault(); setOpen(open === r.id ? null : r.id); }}>{r.title ?? r.path}</a>
            <span class="mono muted">{r.path}</span>
            {open === r.id && <Resolver id={r.id} onDone={() => { setOpen(null); reload(); }} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Resolver({ id, onDone }: { id: string; onDone: () => void }) {
  const { data } = useLoader(() => api<{ conflict: { ours: string; theirs: string; hunks: Array<{ ours: string; theirs: string; oursLabel: string; theirsLabel: string }> } | null }>(`/api/records/${id}`), [id]);
  const [choices, setChoices] = useState<Array<'ours' | 'theirs' | 'both'>>([]);
  if (!data?.conflict) return <p class="muted">Loading…</p>;
  const hunks = data.conflict.hunks;
  const resolve = async () => { await api(`/api/records/${id}/resolve`, { method: 'POST', body: JSON.stringify({ choices: hunks.map((_, i) => choices[i] ?? 'ours') }) }); onDone(); };
  return (
    <div class="resolver">
      {hunks.map((h, i) => (
        <div class="hunk" key={i}>
          <div class={`side ${(choices[i] ?? 'ours') === 'ours' ? 'side--on' : ''}`} onClick={() => setChoices((c) => { const n = [...c]; n[i] = 'ours'; return n; })}><p class="mono muted">{h.oursLabel || 'this side'}</p><pre>{h.ours || '(empty)'}</pre></div>
          <div class={`side ${choices[i] === 'theirs' ? 'side--on' : ''}`} onClick={() => setChoices((c) => { const n = [...c]; n[i] = 'theirs'; return n; })}><p class="mono muted">{h.theirsLabel || 'other side'}</p><pre>{h.theirs || '(empty)'}</pre></div>
          <button type="button" class="btn" onClick={() => setChoices((c) => { const n = [...c]; n[i] = 'both'; return n; })}>Keep both</button>
        </div>
      ))}
      <p><button class="btn btn--solid" onClick={resolve}>Resolve</button> <a class="btn" href={`/private/edit/?id=${id}&mode=markdown`}>Edit by hand</a></p>
    </div>
  );
}

function Suggestions() {
  const { data, reload } = useLoader(() => api<{ suggestions: Array<{ id: string; from_title: string; to_title: string; from_path: string; to_path: string; kind: string; reason: string | null; confidence: number }> }>('/api/suggestions'));
  const act = async (id: string, verb: 'accept' | 'dismiss') => { await api(`/api/suggestions/${id}/${verb}`, { method: 'POST' }); reload(); };
  return (
    <section>
      {data && data.suggestions.length === 0 && <p class="muted">No suggested connections.</p>}
      <ul class="recs">
        {data?.suggestions.map((s) => (
          <li key={s.id}>
            <span class="recs__title">{s.from_title ?? s.from_path} <span class="muted">{s.kind}</span> {s.to_title ?? s.to_path}</span>
            {s.reason && <span class="muted">{s.reason}</span>}
            <span class="mono muted">{Math.round(s.confidence * 100)}%</span>
            <span class="mono"><button class="link" onClick={() => act(s.id, 'accept')}>Accept</button> · <button class="link" onClick={() => act(s.id, 'dismiss')}>Dismiss</button></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tokens() {
  const { data, reload } = useLoader(() => api<{ tokens: Array<{ id: string; name: string; scopes: string; last_used_at: string | null; created_at: string; revoked_at: string | null }>; scopes: string[] }>('/api/tokens'));
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const mint = async (e: Event) => { e.preventDefault(); const r = await api<{ token: string }>('/api/tokens', { method: 'POST', body: JSON.stringify({ name }) }); setFresh(r.token); setName(''); reload(); };
  return (
    <section>
      <p class="mono hub__actions">
        <button class="btn" type="button" onClick={async () => { setFresh(null); const r = await api<{ indexed: number }>('/api/reindex', { method: 'POST' }); toast(`Reindexed ${r.indexed} records from the vault`); }}>Reindex vault</button>
        <button class="btn" type="button" onClick={async () => { await api('/api/rebuild', { method: 'POST' }); toast('Rebuild requested · live in a couple of minutes'); }}>Rebuild site</button>
      </p>
      <p class="muted">Agents connect to <code>{location.origin}/mcp</code> (MCP, Streamable HTTP) or <code>POST /api/tools/&lt;name&gt;</code> with a bearer token.</p>
      <form class="quick" onSubmit={mint}><input placeholder="Token name (e.g. claude)" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /><button class="btn btn--solid">Mint token</button></form>
      {fresh && <p class="fresh"><strong>Copy it now; it is not shown again:</strong> <code>{fresh}</code></p>}
      <ul class="recs">{data?.tokens.map((t) => <li key={t.id}><span class="recs__title">{t.name}</span><span class="mono muted">{t.scopes} · made {when(t.created_at)}{t.last_used_at ? ` · used ${when(t.last_used_at)}` : ''}{t.revoked_at ? ' · revoked' : ''}</span>{!t.revoked_at && <button class="link mono" onClick={async () => { await api(`/api/tokens/${t.id}`, { method: 'DELETE' }); reload(); }}>Revoke</button>}</li>)}</ul>
    </section>
  );
}

function Config() {
  const [name, setName] = useState<'collections' | 'list-types' | 'site'>('collections');
  const { data, reload } = useLoader(() => api<{ raw: string; sha: string | null; path: string }>(`/api/config/raw/${name}`), [name]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { if (data) { setText(data.raw); setStatus(''); } }, [data]);
  const save = async () => {
    setStatus('Saving…');
    try { await api(`/api/config/raw/${name}`, { method: 'PUT', body: JSON.stringify({ raw: text, base_sha: data?.sha ?? undefined }) }); setStatus('Saved · live after the next build'); reload(); }
    catch (e) { setStatus(`Not saved: ${(e as Error).message}`); }
  };
  return (
    <section>
      <p class="muted">Writing collections and list types are plain YAML in the vault. Add a collection like <code>stories</code> here, create the folder <code>writing/stories/</code> in Obsidian (or just save a piece into it), and the section appears.</p>
      <div class="chips" style="margin:1rem 0">
        {(['collections', 'list-types', 'site'] as const).map((n) => <button type="button" class="chip" aria-pressed={name === n} onClick={() => setName(n)}>{{ collections: 'Writing collections', 'list-types': 'List types', site: 'Site' }[n]}</button>)}
      </div>
      <textarea class="config__raw" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} rows={22} spellcheck={false} />
      <p class="chips"><button class="btn btn--solid" type="button" onClick={save}>Save</button><span class="mono muted" style="align-self:center">{status}</span></p>
    </section>
  );
}
