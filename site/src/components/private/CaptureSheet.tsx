// The small universal "+": one box for a thought, a link, or a photo. The agent files it; you say why.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';

type Intent = '' | 'writing' | 'feed' | 'list' | 'review';
export default function CaptureSheet({ preset }: { preset?: { mode?: string; list?: string; collection?: string } }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<Intent>(preset?.mode === 'piece' ? 'writing' : preset?.mode === 'thought' ? 'feed' : preset?.mode === 'entry' || preset?.mode === 'list' ? 'list' : '');
  const [people, setPeople] = useState('');
  const [tags, setTags] = useState('');
  const [priv, setPriv] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState<Array<{ title: string | null; path: string }>>([]);
  const [list, setList] = useState(preset?.list ?? '');
  const open = () => { dlg.current?.showModal(); setStatus(''); if (!lists.length) api<{ lists: typeof lists }>('/api/index/lists').then((d) => setLists(d.lists)).catch(() => {}); };
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'n' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); open(); } }; addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);

  const parse = (raw: string) => {
    // a trailing "@Sam #ceramics" line is private context, never public text
    const lines = raw.trim().split('\n');
    const last = lines[lines.length - 1] ?? '';
    const ppl: string[] = people.split(',').map((s) => s.trim()).filter(Boolean);
    const tg: string[] = tags.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
    if (/^(\s*[@#][\w-]+)+\s*$/.test(last)) {
      for (const m of last.matchAll(/([@#])([\w-]+)/g)) (m[1] === '@' ? ppl : tg).push(m[2]!);
      lines.pop();
    }
    const body = lines.join('\n').trim();
    const url = body.match(/https?:\/\/\S+/)?.[0] ?? '';
    const why = url ? body.replace(url, '').trim() : body;
    return { url, why, body, ppl, tg };
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const { url, why, body, ppl, tg } = parse(text);
    if (!body && !photos.length) return;
    setBusy(true); setStatus('Saving…');
    try {
      if (photos.length) {
        for (const f of photos) {
          const fd = new FormData(); fd.append('file', f); fd.append('title', why.slice(0, 80) || f.name.replace(/\.[^.]+$/, '')); fd.append('why', why); fd.append('visibility', priv ? 'private' : 'public');
          const r = await fetch('/api/photos', { method: 'POST', body: fd, credentials: 'include' });
          if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error ?? `${r.status}`);
        }
        setStatus(`${photos.length} photo${photos.length > 1 ? 's' : ''} saved. Approve ${photos.length > 1 ? 'them' : 'it'} for the wall from the editor.`);
        setPhotos([]); setText('');
      } else if (!url && intent === 'feed') {
        await api('/api/records', { method: 'POST', body: JSON.stringify({ type: 'feed', frontmatter: { visibility: priv ? 'private' : 'public', tags: tg.map((t) => (priv ? t : `private/${t}`)) }, body }) });
        setStatus('Posted. Live in a couple of minutes.'); setText('');
      } else {
        await api('/api/captures', { method: 'POST', body: JSON.stringify({ client_id: crypto.randomUUID(), url: url || undefined, text: !url ? body : undefined, why, intent, list_hint: list || undefined, visibility: priv ? 'private' : 'public', people: ppl, tags: tg }) });
        setStatus('Sent. The agent identifies it, gathers the facts, and files it; watch the inbox.'); setText(''); setPeople(''); setTags('');
      }
    } catch (x) { setStatus(`Not saved: ${(x as Error).message}`); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" class="fab" aria-label="Capture" title="Capture (⌘⇧N)" onClick={open}>+</button>
      <dialog ref={dlg} class="sheet" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <form class="sheet__form" method="dialog" onSubmit={submit}>
          <div class="sheet__head"><h2 class="sheet__title">Capture</h2><button type="button" class="sheet__close" aria-label="Close" onClick={() => dlg.current?.close()}>×</button></div>
          <textarea class="sheet__box" placeholder="A thought, a link, a photo…" rows={5} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} autofocus
            onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type)); if (files.length) { e.preventDefault(); setPhotos((p) => [...p, ...files]); } }} />
          <div class="chips">
            <label class="btn btn--soft"><input type="file" accept="image/*" multiple hidden onChange={(e) => { setPhotos((p) => [...p, ...[...((e.target as HTMLInputElement).files ?? [])]]); (e.target as HTMLInputElement).value = ''; }} />+ Photo</label>
            {photos.map((f, i) => <span class="chip" key={i}>{f.name} <button type="button" class="sheet__x" aria-label="remove" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>×</button></span>)}
          </div>
          <p class="mono sheet__label">File as</p>
          <div class="chips" role="radiogroup" aria-label="File as">
            {([['', 'Auto'], ['writing', 'Writing'], ['feed', 'Feed'], ['list', 'List'], ['review', 'Review']] as Array<[Intent, string]>).map(([v, l]) => <button type="button" class="chip" aria-pressed={intent === v} onClick={() => setIntent(v)}>{l}</button>)}
            {intent === 'list' && lists.length > 0 && <select class="sheet__select" value={list} onChange={(e) => setList((e.target as HTMLSelectElement).value)} aria-label="Which list"><option value="">Agent picks the list</option>{lists.map((l) => <option value={l.path.split('/').pop()!}>{l.title ?? l.path}</option>)}</select>}
          </div>
          <div class="rule-label sheet__rule"><span>Private context</span></div>
          <div class="sheet__ctx">
            <label><span class="mono">@ People</span><input value={people} onInput={(e) => setPeople((e.target as HTMLInputElement).value)} placeholder="Names, comma-separated" /></label>
            <label><span class="mono"># Tags</span><input value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} placeholder="Subjects, comma-separated" /></label>
          </div>
          <p class="mono muted sheet__hint">You can also end your capture with a line like @Sam #ceramics. Neither appears on the public site.</p>
          <div class="sheet__row">
            <span class="seg" role="radiogroup" aria-label="Visibility">
              <button type="button" class="seg__b" aria-pressed={!priv} onClick={() => setPriv(false)}>Public</button>
              <button type="button" class="seg__b" aria-pressed={priv} onClick={() => setPriv(true)}>Private</button>
            </span>
            <span class="mono muted sheet__status">{status || (priv ? 'Stays private.' : 'Posts after the agent organizes it.')}</span>
            <button class="btn btn--solid" type="submit" disabled={busy}>{photos.length ? 'Save photos' : intent === 'feed' && !/https?:\/\//.test(text) ? 'Post' : 'Send to AI'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
