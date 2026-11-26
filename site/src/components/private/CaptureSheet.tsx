// The small universal "+" : a bottom sheet on phones, a popover on desktop. Thought · Link · Piece · List · Add to list.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';

type Mode = 'thought' | 'link' | 'piece' | 'list' | 'entry';
export default function CaptureSheet({ preset }: { preset?: { mode?: Mode; list?: string; collection?: string } }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>(preset?.mode ?? 'thought');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [why, setWhy] = useState('');
  const [priv, setPriv] = useState(false);
  const [status, setStatus] = useState('');
  const [cfg, setCfg] = useState<{ collections: Array<{ key: string; title: string }>; listTypes: Array<{ key: string; title: string }> } | null>(null);
  const [lists, setLists] = useState<Array<{ id: string; title: string | null; path: string }>>([]);
  const [sel, setSel] = useState(preset?.list ?? preset?.collection ?? '');
  const open = () => { dlg.current?.showModal(); if (!cfg) api('/api/config').then((c) => setCfg(c as never)).catch(() => {}); if (!lists.length) api<{ lists: typeof lists }>('/api/index/lists').then((d) => setLists(d.lists)).catch(() => {}); };
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'n' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); open(); } }; addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  const submit = async (e: Event) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      if (mode === 'thought') {
        const r = await api<{ id: string }>('/api/records', { method: 'POST', body: JSON.stringify({ type: 'feed', frontmatter: { visibility: priv ? 'private' : 'public' }, body: text }) });
        setStatus('Posted. Live in a couple of minutes.'); setText('');
        void r;
      } else if (mode === 'link') {
        await api('/api/captures', { method: 'POST', body: JSON.stringify({ client_id: crypto.randomUUID(), url, why, visibility: priv ? 'private' : 'public', intent: sel && sel !== 'auto' ? 'list' : '', list_hint: sel && sel !== 'auto' ? sel : undefined }) });
        setStatus('Saved to the inbox. The agent takes it from here.'); setUrl(''); setWhy('');
      } else if (mode === 'piece') {
        const r = await api<{ id: string }>('/api/records', { method: 'POST', body: JSON.stringify({ type: 'writing', frontmatter: { title: text || 'Untitled', collection: sel || undefined, visibility: priv ? 'private' : 'public' } }) });
        location.href = `/private/edit/?id=${r.id}`;
      } else if (mode === 'list') {
        const r = await api<{ id: string }>('/api/records', { method: 'POST', body: JSON.stringify({ type: 'list', frontmatter: { title: text, list_type: sel || undefined, visibility: priv ? 'private' : 'public' } }) });
        location.href = `/private/edit/?id=${r.id}`;
      } else if (mode === 'entry') {
        await api('/api/captures', { method: 'POST', body: JSON.stringify({ client_id: crypto.randomUUID(), url: url || undefined, text: !url ? text : undefined, why, intent: 'list', list_hint: sel || undefined, visibility: priv ? 'private' : 'public' }) });
        setStatus('Queued for the list. The agent identifies it and files it.'); setUrl(''); setText(''); setWhy('');
      }
    } catch (x) { setStatus(`Not saved: ${(x as Error).message}`); }
  };
  return (
    <>
      <button type="button" class="fab" aria-label="Add" title="Add (⌘⇧N)" onClick={open}>+</button>
      <dialog ref={dlg} class="sheet" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <form class="sheet__form" method="dialog" onSubmit={submit}>
          <nav class="chips mono" aria-label="What to add">
            {(['thought', 'link', 'entry', 'piece', 'list'] as Mode[]).map((m) => <button type="button" class={mode === m ? 'on' : ''} onClick={() => { setMode(m); setStatus(''); }}>{{ thought: 'Thought', link: 'Link', entry: 'Add to list', piece: 'New piece', list: 'New list' }[m]}</button>)}
          </nav>
          {mode === 'thought' && <textarea placeholder="A short thought…" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} rows={4} autofocus />}
          {(mode === 'link' || mode === 'entry') && (<>
            <input placeholder={mode === 'entry' ? 'Link, or a title' : 'Paste a link'} value={mode === 'entry' && !url ? text || url : url} onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (/^https?:\/\//.test(v)) { setUrl(v); setText(''); } else { setText(v); setUrl(''); } }} inputMode="url" autofocus />
            <input placeholder="Why I'm interested (one sentence)" value={why} onInput={(e) => setWhy((e.target as HTMLInputElement).value)} />
            <select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)} aria-label="List">
              <option value="">{mode === 'entry' ? 'Pick a list' : 'Let the agent decide'}</option>
              {lists.map((l) => <option value={l.path.split('/').pop()!}>{l.title ?? l.path}</option>)}
            </select>
          </>)}
          {mode === 'piece' && (<>
            <input placeholder="Title" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} autofocus />
            <select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)} aria-label="Collection">{cfg?.collections.map((c) => <option value={c.key}>{c.title}</option>)}</select>
          </>)}
          {mode === 'list' && (<>
            <input placeholder="List title" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} autofocus />
            <select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)} aria-label="List type">{cfg?.listTypes.map((c) => <option value={c.key}>{c.title}</option>)}</select>
          </>)}
          <div class="sheet__row">
            <label class="mono"><input type="checkbox" checked={priv} onChange={(e) => setPriv((e.target as HTMLInputElement).checked)} /> Private</label>
            <span class="mono muted sheet__status">{status}</span>
            <button class="btn btn--solid" type="submit">{mode === 'piece' || mode === 'list' ? 'Create' : 'Save'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
