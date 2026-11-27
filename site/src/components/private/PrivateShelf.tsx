// On a section page: Public (the page as visitors see it) | Private | Drafts. The private views come from the API
// and render the same kind of cards, with the owner tools, so nothing you hide from visitors is hidden from you.
import { useEffect, useState } from 'preact/hooks';
import { listRecords, humanKind, getConfig, when, type RecordSummary, type Config } from './api';
import VisibilityPill from './ui/VisibilityPill';
import DeleteButton from './ui/DeleteButton';

export default function PrivateShelf({ type, label }: { type: 'writing' | 'feed' | 'list' | 'review'; label?: string }) {
  const [view, setView] = useState<'public' | 'private' | 'draft'>('public');
  const [rows, setRows] = useState<RecordSummary[] | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => { getConfig().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-shelf-static]').forEach((el) => { el.hidden = view !== 'public'; });
    if (view === 'public') { setRows(null); return; }
    listRecords({ type, ...(view === 'private' ? { visibility: 'private' } : { status: 'draft' }), limit: 200 }).then((d) => setRows(d.records)).catch(() => setRows([]));
  }, [view, type]);
  const noun = label ?? (type === 'feed' ? 'thoughts' : type === 'writing' ? 'pieces' : type === 'list' ? 'lists' : 'reviews');
  return (
    <div class="shelf">
      <p class="chips shelf__bar">
        <span class="seg seg--small" role="radiogroup" aria-label="Which ones">
          <button type="button" class="seg__b" aria-pressed={view === 'public'} onClick={() => setView('public')}>Public</button>
          <button type="button" class="seg__b" aria-pressed={view === 'private'} onClick={() => setView('private')}>Private</button>
          {type !== 'feed' && type !== 'list' && <button type="button" class="seg__b" aria-pressed={view === 'draft'} onClick={() => setView('draft')}>Drafts</button>}
        </span>
        {view !== 'public' && <span class="mono muted">{view === 'private' ? 'Hidden from visitors, not from you.' : 'Not yet published.'}</span>}
      </p>
      {view !== 'public' && (
        rows === null ? <p class="muted">Loading…</p> : rows.length === 0 ? <p class="muted">No {view === 'private' ? 'private' : 'draft'} {noun}.</p> : (
          <ul class="shelf__cards">
            {rows.map((r) => (
              <li class="shelf__card" key={r.id} data-article={r.id}>
                <p class="mono muted shelf__kicker">{humanKind(r, cfg)}{r.date ? ' · ' + when(String(r.date), { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</p>
                <h3 class="shelf__title"><a href={r.type === 'list' ? `/private/view/?id=${r.id}` : `/private/edit/?id=${r.id}`}>{r.title ?? (r.excerpt ? r.excerpt.slice(0, 80) : r.path.split('/').pop())}</a></h3>
                {r.title && r.excerpt && <p class="shelf__excerpt">{r.excerpt.slice(0, 160)}{r.excerpt.length > 160 ? '…' : ''}</p>}
                <p class="chips owner-row owner-row--tight">
                  <VisibilityPill id={r.id} value={r.visibility ?? 'public'} type={r.type} />
                  <a class="btn btn--soft btn--small" href={r.type === 'list' ? `/private/view/?id=${r.id}` : `/private/edit/?id=${r.id}`}>{r.type === 'list' ? 'Open' : 'Edit'}</a>
                  <DeleteButton rec={{ id: r.id, title: r.title, type: r.type }} />
                </p>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
