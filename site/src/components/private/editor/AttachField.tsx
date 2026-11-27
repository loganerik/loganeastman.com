// A thought's attachment, like a link in a tweet: paste a web link (it becomes a link item with its page's picture)
// or type to pick something already in the vault (a film, a book, a thing).
import { useState } from 'preact/hooks';
import RecordPicker from '../ui/RecordPicker';
import { api } from '../api';

const wl = (v: unknown) => String(v ?? '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');

export default function AttachField({ value, label, onChange }: { value: unknown; label: string; onChange: (v: string | undefined) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const path = wl(value);
  const attach = async (raw: string) => {
    const u = raw.trim();
    if (!/^https?:\/\/\S+$/.test(u)) return;
    setBusy(true); setErr('');
    try {
      const r = await api<{ path: string; title: string }>('/api/links', { method: 'POST', body: JSON.stringify({ url: u }) });
      setTitle(r.title); setUrl(''); onChange(`[[${r.path}]]`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div class="field attach">
      <span class="field__label">{label}</span>
      {path ? (
        <p class="attach__on">
          <span>{title || path.split('/').pop()!.replace(/-/g, ' ')}</span>
          <button type="button" class="btn btn--small btn--soft" onClick={() => { setTitle(''); onChange(undefined); }}>Remove</button>
        </p>
      ) : (
        <>
          <input type="url" inputMode="url" value={url} disabled={busy} placeholder="Paste a link…"
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; setUrl(v); if (/^https?:\/\/\S+\s*$/.test(v) && v.length > 12 && (e as InputEvent).inputType === 'insertFromPaste') void attach(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void attach(url); } }}
            onBlur={() => void attach(url)} />
          {busy && <span class="field__hint mono muted">Reading the page…</span>}
          {err && <span class="field__hint mono">{err}</span>}
          {!url && <RecordPicker type="item" placeholder="…or pick a film, book, thing" onChange={(p) => { if (p) { setTitle(p.title); onChange(`[[${p.path}]]`); } }} />}
        </>
      )}
      <span class="field__hint mono muted">Shows under the note as a card. The picture is cut out on its own; change that on the link's page.</span>
    </div>
  );
}
