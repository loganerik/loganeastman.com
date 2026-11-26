// /private/new: a tiny form that creates the record, then hands off to the editor.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';

export default function NewRecord() {
  const p = new URLSearchParams(location.search);
  const type = p.get('type') ?? p.get('kind') ?? 'writing';
  const [cfg, setCfg] = useState<{ collections: Array<{ key: string; title: string }>; listTypes: Array<{ key: string; title: string; item_kinds: string[] }> } | null>(null);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState(p.get('collection') ?? p.get('list_type') ?? '');
  const [ref, setRef] = useState(p.get('item') ?? p.get('list') ?? '');
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/config').then((c) => setCfg(c as never)); }, []);
  const needsTitle = ['writing', 'list', 'item', 'person', 'tag'].includes(type);
  const create = async (e: Event) => {
    e.preventDefault();
    setErr('');
    const frontmatter: Record<string, unknown> = {};
    if (needsTitle) frontmatter.title = title;
    if (type === 'writing') frontmatter.collection = sel || cfg?.collections[0]?.key;
    if (type === 'list') frontmatter.list_type = sel || cfg?.listTypes[0]?.key;
    if (type === 'review') frontmatter.item = ref;
    if (type === 'list-entry') { frontmatter.list = p.get('list'); frontmatter.item = ref; }
    if (type === 'item') frontmatter.kind = sel || 'link';
    if (type === 'feed' && title) frontmatter.title = title;
    try {
      const r = await api<{ id: string }>('/api/records', { method: 'POST', body: JSON.stringify({ type, frontmatter, body: '' }) });
      location.href = `/private/edit/?id=${r.id}`;
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <form class="newrec" onSubmit={create}>
      <p class="mono muted">New {type.replace('-', ' ')}</p>
      {(needsTitle || type === 'feed') && <label class="fm__f fm__f--title"><span class="mono">{type === 'person' || type === 'tag' ? 'Name' : type === 'feed' ? 'Title (optional)' : 'Title'}</span><input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} autofocus required={needsTitle} /></label>}
      {type === 'writing' && cfg && <label class="fm__f"><span class="mono">Collection</span><select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)}>{cfg.collections.map((c) => <option value={c.key}>{c.title}</option>)}</select></label>}
      {type === 'list' && cfg && <label class="fm__f"><span class="mono">List type</span><select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)}>{cfg.listTypes.map((c) => <option value={c.key}>{c.title}</option>)}</select></label>}
      {type === 'item' && <label class="fm__f"><span class="mono">Kind</span><select value={sel} onChange={(e) => setSel((e.target as HTMLSelectElement).value)}>{['film', 'tv', 'book', 'album', 'product', 'place', 'link', 'photo'].map((k) => <option value={k}>{k}</option>)}</select></label>}
      {(type === 'review' || type === 'list-entry') && <label class="fm__f"><span class="mono">Item (id or path)</span><input value={ref} onInput={(e) => setRef((e.target as HTMLInputElement).value)} required /></label>}
      {err && <p class="err mono">{err}</p>}
      <p><button class="btn btn--solid">Create and edit</button></p>
    </form>
  );
}
