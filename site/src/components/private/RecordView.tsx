// A record that has no public page yet (private, or a draft) still gets a page: a private list shows its entries
// with the full tools; anything else opens in the editor.
import { useEffect, useState } from 'preact/hooks';
import { api, humanKind, getConfig, when, type Config } from './api';
import Editor from './editor/Editor';
import ListTools from './ListTools';
import VisibilityPill from './ui/VisibilityPill';

interface ListView { list: { id: string; path: string; title: string | null; list_type: string | null; visibility: string | null; summary: string | null; body: string }; entries: Array<{ id: string; path: string; state: string; added: string | null; finished: string | null; from: string | null; visibility: string | null; why: string; item: { id: string | null; path: string; title: string | null; kind: string | null; url?: string; visibility?: string | null; artwork?: { thumb?: string | null; clip?: string | null } } }>; counts: { active: number; done: number } }

export default function RecordView() {
  const id = new URLSearchParams(location.search).get('id') ?? '';
  const [rec, setRec] = useState<{ type: string } | null>(null);
  const [list, setList] = useState<ListView | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    getConfig().then(setCfg).catch(() => {});
    api<{ type: string }>(`/api/records/${id}`).then(async (r) => { setRec(r); if (r.type === 'list') setList(await api<ListView>(`/api/lists/${id}?all=1`)); }).catch((e) => setErr((e as Error).message));
  }, [id]);
  if (err) return <p class="err mono">{err}</p>;
  if (!rec) return <p class="muted">Loading…</p>;
  if (rec.type !== 'list') return <Editor id={id} />;
  if (!list) return <p class="muted">Loading…</p>;
  const lt = cfg?.listTypes.find((t) => t.key === list.list.list_type);
  const active = list.entries.filter((e) => e.state === 'active');
  const done = list.entries.filter((e) => e.state === 'done');
  const row = (e: ListView['entries'][number]) => (
    <li class="entry entry--view" data-entry data-state={e.state} key={e.id}>
      {(e.item.artwork?.clip || e.item.artwork?.thumb) && <a class="entry__art" href={e.item.url ?? '#'} tabindex={-1}><img src={e.item.artwork.clip ?? e.item.artwork.thumb ?? ''} alt="" loading="lazy" /></a>}
      <div class="entry__text">
        <p class="mono muted entry__kicker">{e.item.kind ? humanKind({ type: 'item', kind: e.item.kind }, cfg) : 'Thing'}{e.item.visibility === 'private' ? ' · private' : ''}{e.state === 'done' ? ' · finished' : ''}</p>
        <h3 class="entry__title">{e.item.url && e.item.visibility !== 'private' ? <a href={e.item.url}>{e.item.title}</a> : <a href={`/private/edit/?id=${e.item.id}`}>{e.item.title}</a>}</h3>
        {e.why && <p class="entry__why">{e.why}</p>}
        <p class="mono faint entry__added">Added {e.added ? when(e.added, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}{e.finished ? ` · finished ${when(e.finished, { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}</p>
        <p class="chips owner-row entry__tools">
          {e.item.id && <button type="button" class="btn btn--soft btn--small" data-edit={e.item.id} data-edit-title={e.item.title ?? ''}>Edit item</button>}
          <button type="button" class="btn btn--soft btn--small" data-edit={e.id} data-edit-title={`Note · ${e.item.title ?? ''}`}>Edit note</button>
          {lt?.completion && e.state !== 'done' ? <button type="button" class="btn btn--soft btn--small" data-complete={e.id} data-complete-title={e.item.title ?? ''}>{lt.completion.label ?? 'Mark done'}</button> : e.state === 'done' ? <button type="button" class="btn btn--soft btn--small" data-state={e.id} data-state-to="active">Put back</button> : <button type="button" class="btn btn--soft btn--small" data-state={e.id} data-state-to="done">Done</button>}
          <button type="button" class="btn btn--soft btn--small" data-remove={e.id} data-remove-title={e.item.title ?? ''}>Remove</button>
        </p>
      </div>
    </li>
  );
  return (
    <div class="record-view">
      <p class="mono muted">{lt?.title ?? 'List'}{list.list.visibility === 'private' ? ' · private · visitors cannot see this page' : ''}</p>
      <div class="hub__top"><h1 class="hub__title">{list.list.title}</h1><span class="chips"><button type="button" class="btn btn--soft" data-compose="list-entry" data-list={list.list.path.split('/').pop()}>{lt?.add_label ?? 'Add'}</button></span></div>
      {list.list.summary && <p class="muted">{list.list.summary}</p>}
      <ListTools listId={list.list.id} listTitle={list.list.title ?? undefined} visibility={list.list.visibility ?? 'public'} />
      {list.entries.length === 0 && <p class="muted">Nothing on it yet.</p>}
      <ul class="grid grid--rows">{active.map(row)}</ul>
      {done.length > 0 && (<><div class="rule-label"><span>Finished</span></div><ul class="grid grid--rows">{done.map(row)}</ul></>)}
      <p class="mono muted" hidden><VisibilityPill id={list.list.id} value={list.list.visibility ?? 'public'} type="list" /></p>
    </div>
  );
}
