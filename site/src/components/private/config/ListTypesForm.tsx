import { useEffect, useState } from 'preact/hooks';
import { useConfigFile, slugKey } from './useConfigFile';
import { KIND_LABELS } from '../api';

interface Lt { key: string; title: string; queue?: boolean; done?: boolean; item_kinds?: string[]; default_for?: string[]; add_label?: string; private_default?: boolean; allow_for?: boolean; form?: string; completion?: { list: string; label?: string }; _new?: boolean }
const KINDS = Object.keys(KIND_LABELS);

export default function ListTypesForm({ onSaved }: { onSaved?: () => void }) {
  const { file, usage, err, busy, save } = useConfigFile('list-types');
  const [rows, setRows] = useState<Lt[]>([]);
  const [openRow, setOpenRow] = useState<number | null>(null);
  useEffect(() => { if (file) setRows(((file.frontmatter.list_types as Lt[]) ?? []).map((c) => ({ ...c }))); }, [file]);
  const upd = (i: number, patch: Partial<Lt>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const toggleIn = (arr: string[] | undefined, k: string) => (arr ?? []).includes(k) ? (arr ?? []).filter((x) => x !== k) : [...(arr ?? []), k];
  const used = (c: Lt) => usage.list_types[c.key] ?? 0;
  if (!file) return <p class="muted">{err || 'Loading…'}</p>;
  return (
    <form class="cfg" onSubmit={async (e) => { e.preventDefault(); const clean = rows.map(({ _new, ...c }) => ({ ...c, key: c.key || slugKey(c.title), completion: c.completion?.list ? c.completion : undefined })).filter((c) => c.title.trim()); if (await save({ list_types: clean })) onSaved?.(); }}>
      <p class="muted cfg__intro">A kind of list says what goes on it, how it looks, and what finishing something does.</p>
      <ul class="cfg__rows">
        {rows.map((c, i) => (
          <li class="cfg__row cfg__row--stack" key={c.key || i}>
            <div class="cfg__main">
              <input class="cfg__title" value={c.title} placeholder="Kind of list" onInput={(e) => { const t = (e.target as HTMLInputElement).value; upd(i, { title: t, ...(c._new ? { key: slugKey(t) } : {}) }); }} />
              <label class="cfg__tog" title="A queue shows whole posters and covers, like a watchlist"><input type="checkbox" checked={!!c.queue} onChange={(e) => upd(i, { queue: (e.target as HTMLInputElement).checked })} /> Queue</label>
              <label class="cfg__tog"><input type="checkbox" checked={!!c.private_default} onChange={(e) => upd(i, { private_default: (e.target as HTMLInputElement).checked })} /> Private by default</label>
              <button type="button" class="btn btn--small" aria-pressed={openRow === i} onClick={() => setOpenRow(openRow === i ? null : i)}>{openRow === i ? 'Less' : 'More'}</button>
              <span class="cfg__spacer" />
              <span class="mono muted">{c._new ? '' : used(c) ? `${used(c)} list${used(c) === 1 ? '' : 's'}` : 'unused'}</span>
              <button type="button" class="btn btn--small" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" class="btn btn--small" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" class="btn btn--small btn--soft" disabled={used(c) > 0} title={used(c) ? 'Change those lists first' : undefined} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button>
            </div>
            {openRow === i && (
              <div class="fields fields--2 cfg__more">
                <div class="field"><span class="field__label">What goes on it</span><div class="chips">{KINDS.map((k) => <button type="button" class="chip chip--small" aria-pressed={(c.item_kinds ?? []).includes(k)} onClick={() => upd(i, { item_kinds: toggleIn(c.item_kinds, k) })}>{KIND_LABELS[k]}</button>)}</div></div>
                <div class="field"><span class="field__label">Default home for</span><div class="chips">{KINDS.map((k) => <button type="button" class="chip chip--small" aria-pressed={(c.default_for ?? []).includes(k)} onClick={() => upd(i, { default_for: toggleIn(c.default_for, k) })}>{KIND_LABELS[k]}</button>)}</div></div>
                <label class="field"><span class="field__label">Add button says</span><input value={c.add_label ?? ''} placeholder="Add film" onInput={(e) => upd(i, { add_label: (e.target as HTMLInputElement).value || undefined })} /></label>
                <label class="field"><span class="field__label">Shape on the wall</span><select value={c.form ?? ''} onChange={(e) => upd(i, { form: (e.target as HTMLSelectElement).value || undefined })}><option value="">Let the wall choose</option><option value="seal">Seal</option><option value="arch">Arch</option><option value="stepped">Stepped frame</option><option value="slip">Slip</option></select></label>
                <label class="field"><span class="field__label">Finishing moves things to</span><select value={c.completion?.list ?? ''} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; upd(i, { completion: v ? { list: v, label: c.completion?.label } : undefined }); }}><option value="">Nowhere (stays, marked finished)</option>{rows.filter((o) => o.key && o.key !== c.key).map((o) => <option value={o.key}>{o.title || o.key}</option>)}</select></label>
                <label class="field"><span class="field__label">Finish button says</span><input value={c.completion?.label ?? ''} placeholder="Mark watched" disabled={!c.completion?.list} onInput={(e) => upd(i, { completion: { list: c.completion?.list ?? '', label: (e.target as HTMLInputElement).value || undefined } })} /></label>
                <label class="cfg__tog"><input type="checkbox" checked={!!c.done} onChange={(e) => upd(i, { done: (e.target as HTMLInputElement).checked })} /> Holds finished things (Watched, Read…)</label>
                <label class="cfg__tog"><input type="checkbox" checked={!!c.allow_for} onChange={(e) => upd(i, { allow_for: (e.target as HTMLInputElement).checked })} /> Entries can name a recipient (gifts)</label>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div class="sheet__row">
        <button type="button" class="btn" onClick={() => { setRows((r) => [...r, { key: '', title: '', queue: false, item_kinds: [], default_for: [], _new: true }]); setOpenRow(rows.length); }}>+ Add a kind of list</button>
        <span class="mono muted sheet__status">{err}</span>
        <button class="btn btn--solid" disabled={busy}>Save</button>
      </div>
    </form>
  );
}
