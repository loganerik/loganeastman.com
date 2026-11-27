import { useEffect, useRef, useState } from 'preact/hooks';
import { listRecords, humanKind, getConfig, type RecordSummary, type Config } from '../api';

export interface Picked { id: string; path: string; title: string; kind?: string | null }
/** A search box that resolves to one record. Never shows an id; stores a `[[path]]` for the caller. */
export default function RecordPicker({ type, kinds, value, label, onChange, placeholder = 'Start typing a title…', autofocus = false }: { type: string; kinds?: string[]; value?: string; label?: string; onChange: (p: Picked | null) => void; placeholder?: string; autofocus?: boolean }) {
  const [q, setQ] = useState(label ?? '');
  const [hits, setHits] = useState<RecordSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [hi, setHi] = useState(0);
  const t = useRef<number | null>(null);
  useEffect(() => { getConfig().then(setCfg).catch(() => {}); }, []);
  useEffect(() => { if (label !== undefined) setQ(label); }, [label]);
  const search = (text: string) => {
    setQ(text); setOpen(true);
    if (t.current) clearTimeout(t.current);
    t.current = window.setTimeout(async () => {
      const r = await listRecords({ type, q: text.trim(), limit: 20 }).catch(() => ({ records: [] as RecordSummary[] }));
      setHits(r.records.filter((x) => !kinds || !x.kind || kinds.includes(x.kind)).slice(0, 10)); setHi(0);
    }, 180);
  };
  const pick = (r: RecordSummary) => { setQ(r.title ?? r.path); setOpen(false); onChange({ id: r.id, path: r.path, title: r.title ?? r.path, kind: r.kind }); };
  return (
    <div class="picker">
      <input class="picker__in" value={q} placeholder={placeholder} autofocus={autofocus} onInput={(e) => search((e.target as HTMLInputElement).value)} onFocus={() => { if (!hits.length) search(q); else setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (!open) return; if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi]!); } else if (e.key === 'Escape') setOpen(false); }} />
      {value && !open && <span class="picker__val mono muted">{value}</span>}
      {open && hits.length > 0 && (
        <ul class="picker__list" role="listbox">
          {hits.map((r, i) => <li key={r.id} role="option" aria-selected={i === hi} class={i === hi ? 'is-hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(r); }}><span class="picker__title">{r.title ?? r.path}</span><span class="mono muted picker__kicker">{humanKind(r, cfg)}{r.year ? ' · ' + r.year : ''}</span></li>)}
        </ul>
      )}
    </div>
  );
}
