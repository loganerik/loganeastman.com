import { useEffect, useState } from 'preact/hooks';
import { useConfigFile, slugKey } from './useConfigFile';

interface Col { key: string; title: string; path?: string; form?: 'arch' | 'stepped'; feed?: boolean; nav?: boolean; _new?: boolean }

export default function CollectionsForm({ onSaved }: { onSaved?: () => void }) {
  const { file, usage, err, busy, save } = useConfigFile('collections');
  const [rows, setRows] = useState<Col[]>([]);
  useEffect(() => { if (file) setRows(((file.frontmatter.collections as Col[]) ?? []).map((c) => ({ ...c }))); }, [file]);
  const upd = (i: number, patch: Partial<Col>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const used = (c: Col) => usage.collections[c.key] ?? 0;
  if (!file) return <p class="muted">{err || 'Loading…'}</p>;
  return (
    <form class="cfg" onSubmit={async (e) => { e.preventDefault(); const clean = rows.map(({ _new, ...c }) => ({ ...c, key: c.key || slugKey(c.title) })).filter((c) => c.title.trim()); if (await save({ collections: clean })) onSaved?.(); }}>
      <p class="muted cfg__intro">Collections group your writing. Each gets its own section and folder in the vault.</p>
      <ul class="cfg__rows">
        {rows.map((c, i) => (
          <li class="cfg__row" key={c.key || i}>
            <div class="cfg__main">
              <input class="cfg__title" value={c.title} placeholder="Collection title" onInput={(e) => { const t = (e.target as HTMLInputElement).value; upd(i, { title: t, ...(c._new ? { key: slugKey(t) } : {}) }); }} />
              <span class="seg seg--small" role="radiogroup" aria-label="Shape on the wall">
                <button type="button" class="seg__b" aria-pressed={(c.form ?? 'arch') === 'arch'} onClick={() => upd(i, { form: 'arch' })}>Arch</button>
                <button type="button" class="seg__b" aria-pressed={c.form === 'stepped'} onClick={() => upd(i, { form: 'stepped' })}>Stepped</button>
              </span>
              <label class="cfg__tog"><input type="checkbox" checked={c.feed !== false} onChange={(e) => upd(i, { feed: (e.target as HTMLInputElement).checked })} /> In the feed</label>
              <label class="cfg__tog"><input type="checkbox" checked={!!c.nav} onChange={(e) => upd(i, { nav: (e.target as HTMLInputElement).checked })} /> In the nav</label>
            </div>
            <div class="cfg__side">
              <span class="mono muted">{c._new ? `will live at writing/${c.key || '…'}` : used(c) ? `${used(c)} piece${used(c) === 1 ? '' : 's'}` : 'empty'}</span>
              <button type="button" class="btn btn--small" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" class="btn btn--small" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" class="btn btn--small btn--soft" disabled={used(c) > 0} title={used(c) ? 'Move its pieces first' : undefined} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div class="sheet__row">
        <button type="button" class="btn" onClick={() => setRows((r) => [...r, { key: '', title: '', form: 'arch', feed: true, nav: false, _new: true }])}>+ Add a collection</button>
        <span class="mono muted sheet__status">{err}</span>
        <button class="btn btn--solid" disabled={busy}>Save</button>
      </div>
    </form>
  );
}
