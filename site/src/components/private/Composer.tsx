// The owner's "+": one sheet to make anything. Pick what it is, write, press Save. Nothing exists until Save, so an
// abandoned thought leaves nothing behind. A link or a photo switches the sheet into capture mode, where the agent
// identifies the thing and files it. A piece or a review can carry on straight into the editor, same screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, createRecord, getConfig, type Config, type Loaded } from './api';
import { fieldsFor, relatedWithPeople } from './editor/fields';
import FieldRow from './editor/FieldRow';
import RecordPicker, { type Picked } from './ui/RecordPicker';
import ChipInput from './ui/ChipInput';
import Sheet from './ui/Sheet';
import Editor from './editor/Editor';
import { toast } from './ui/toast';

type Kind = 'feed' | 'writing' | 'review' | 'list' | 'list-entry' | 'item' | 'person';
const KINDS: Array<[Kind, string]> = [['feed', 'Thought'], ['writing', 'Piece'], ['review', 'Review'], ['list', 'List'], ['list-entry', 'On a list'], ['item', 'Thing'], ['person', 'Person']];
export interface Preset { mode?: string; list?: string; collection?: string; item?: string; itemKind?: string; itemTitle?: string; listTitle?: string }
type Intent = '' | 'writing' | 'feed' | 'list' | 'review';

/** `@Name #tag` anywhere in the text become people and tags; a trailing line of only such tokens is removed. */
export function extractMentions(raw: string): { body: string; people: string[]; tags: string[] } {
  const people: string[] = [], tags: string[] = [];
  const lines = raw.trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  if (lines.length > 1 && /^(\s*[@#][\w/-]+)+\s*$/.test(last)) lines.pop();
  for (const m of raw.matchAll(/(^|[\s(])@([A-Za-z][\w'-]*)/g)) if (!people.includes(m[2]!)) people.push(m[2]!);
  for (const m of raw.matchAll(/(^|[\s(])#([A-Za-z][\w/-]*)/g)) if (!tags.includes(m[2]!)) tags.push(m[2]!);
  return { body: lines.join('\n').trim(), people, tags };
}

export default function Composer({ preset, page = false }: { preset?: Preset; page?: boolean }) {
  const presetKind = (): Kind => preset?.mode === 'piece' ? 'writing' : preset?.mode === 'thought' ? 'feed' : preset?.mode === 'entry' ? 'list-entry' : preset?.mode === 'list' ? 'list' : preset?.mode === 'review' ? 'review' : 'feed';
  const [open, setOpen] = useState(page);
  const [kind, setKind] = useState<Kind>(presetKind());
  const [text, setText] = useState('');
  const [fm, setFm] = useState<Record<string, unknown>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [priv, setPriv] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Loaded | null>(null);
  const [lists, setLists] = useState<Array<{ id: string; title: string | null; path: string; list_type: string | null }>>([]);
  const [intent, setIntent] = useState<Intent>('');
  const [listHint, setListHint] = useState(preset?.list ?? '');
  const [item, setItem] = useState<Picked | null>(preset?.item ? { id: preset.item, path: preset.item, title: preset.itemTitle ?? '', kind: preset.itemKind } : null);
  const box = useRef<HTMLTextAreaElement>(null);
  const url = text.match(/https?:\/\/\S+/)?.[0] ?? '';
  const capture = !!url || photos.length > 0;

  const show = (k?: Kind, p?: Partial<Preset>) => {
    if (k) setKind(k);
    if (p?.list) setListHint(p.list);
    if (p?.item) setItem({ id: p.item, path: p.item, title: p.itemTitle ?? '', kind: p.itemKind });
    setStatus(''); setOpen(true);
    getConfig().then(setCfg).catch(() => {});
    if (!lists.length) api<{ lists: typeof lists }>('/api/index/lists').then((d) => setLists(d.lists)).catch(() => {});
    setTimeout(() => box.current?.focus(), 50);
  };
  useEffect(() => {
    if (page) show(new URLSearchParams(location.search).get('type') as Kind || presetKind());
    const key = (e: KeyboardEvent) => { if (e.key === 'n' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); show(); } };
    const click = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-compose]');
      if (!b) return;
      e.preventDefault();
      show((b.dataset.compose as Kind) || undefined, { list: b.dataset.list, item: b.dataset.item, itemTitle: b.dataset.itemTitle, itemKind: b.dataset.itemKind });
    };
    addEventListener('keydown', key); document.addEventListener('click', click);
    return () => { removeEventListener('keydown', key); document.removeEventListener('click', click); };
  }, []);

  const reset = () => { setText(''); setFm({}); setPeople([]); setTags([]); setPhotos([]); setEditing(null); setStatus(''); setItem(preset?.item ? item : null); };
  const close = () => { if (page) { location.href = document.referrer && !document.referrer.includes('/private/new') ? document.referrer : '/private/'; return; } setOpen(false); reset(); };
  const fields = fieldsFor(kind, cfg, (fm.kind as string) ?? 'link');
  const essentials = fields.essentials.filter((f) => f.key !== 'title' && f.key !== 'name' && f.key !== 'item' && f.key !== 'state');
  const titleField = fields.essentials.find((f) => f.key === 'title' || f.key === 'name');
  const kindsForList = (l: { list_type: string | null }) => cfg?.listTypes.find((t) => t.key === l.list_type)?.item_kinds ?? [];

  const submit = async (keepWriting = false) => {
    const m = extractMentions(text);
    const allPeople = [...new Set([...people, ...m.people])];
    const allTags = [...new Set([...tags, ...m.tags])];
    if (capture) {
      setBusy(true); setStatus('Sending…');
      try {
        if (photos.length) {
          for (const f of photos) {
            const fd = new FormData(); fd.append('file', f); fd.append('title', m.body.slice(0, 80) || f.name.replace(/\.[^.]+$/, '')); fd.append('why', m.body); fd.append('visibility', priv ? 'private' : 'public');
            const r = await fetch('/api/photos', { method: 'POST', body: fd, credentials: 'include' });
            if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error ?? `${r.status}`);
          }
          toast(`${photos.length} photo${photos.length > 1 ? 's' : ''} saved · approve for the wall from the editor`);
        } else {
          const why = m.body.replace(url, '').trim();
          await api('/api/captures', { method: 'POST', body: JSON.stringify({ client_id: crypto.randomUUID(), url, why, intent, list_hint: listHint || undefined, visibility: priv ? 'private' : 'public', people: allPeople, tags: allTags }) });
          toast('Sent · the agent identifies it and files it; watch the inbox', { action: 'Inbox', onAction: () => { location.href = '/private/'; } });
        }
        close();
      } catch (e) { setStatus(`Not sent: ${(e as Error).message}`); }
      finally { setBusy(false); }
      return;
    }
    const title = String(fm.title ?? fm.name ?? '').trim();
    if (titleField && !title && kind !== 'feed') { setStatus(`Give it a ${titleField.label.toLowerCase()}.`); return; }
    if (!m.body && kind === 'feed') { setStatus('Write something first.'); return; }
    if ((kind === 'review' || kind === 'list-entry') && !item) { setStatus('Pick what it is about.'); return; }
    if (kind === 'list-entry' && !listHint) { setStatus('Pick a list.'); return; }
    setBusy(true); setStatus('Saving…');
    try {
      const front: Record<string, unknown> = { ...fm, visibility: priv ? 'private' : 'public' };
      if (allTags.length) front.tags = allTags.map((t) => (priv || t.startsWith('private/') ? t : t));
      if (allPeople.length) front.related = relatedWithPeople(fm.related, allPeople);
      if (kind === 'feed') { delete front.title; if (fm.title) front.title = fm.title; }
      if (kind === 'writing') { front.collection = fm.collection ?? preset?.collection ?? cfg?.collections[0]?.key; front.draft = fm.draft ?? !keepWriting ? fm.draft ?? false : true; }
      if (kind === 'review') { front.item = item!.path; front.draft = keepWriting; }
      if (kind === 'list-entry') { front.list = listHint; front.item = item!.path; }
      if (kind === 'list') front.list_type = fm.list_type ?? cfg?.listTypes[0]?.key;
      if (kind === 'item') front.kind = fm.kind ?? 'link';
      const r = await createRecord(kind, front, m.body);
      if (keepWriting) { setEditing({ id: r.id, path: r.path, type: kind, frontmatter: r.frontmatter, body: r.body, raw: '', sha: r.sha, conflict: null }); setStatus(''); return; }
      toast(kind === 'feed' ? 'Posted · live in a couple of minutes' : 'Saved · live after the next build', { action: 'Open', onAction: () => { location.href = `/private/edit/?id=${r.id}`; } });
      close();
    } catch (e) { setStatus(`Not saved: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const body = (
    <>
      {!editing && (
        <div class="chips composer__kinds" role="radiogroup" aria-label="What is it">
          {KINDS.filter(([k]) => !(k === 'list-entry' && !lists.length && !preset?.list)).map(([k, l]) => <button type="button" class="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
        </div>
      )}
      {editing ? (
        <div class="composer__editor"><Editor record={editing} inline onDone={() => { toast('Saved · live after the next build'); close(); }} onDeleted={close} /></div>
      ) : (
        <>
          {titleField && kind !== 'feed' && <input class="composer__title" placeholder={titleField.label} value={String(fm.title ?? fm.name ?? '')} onInput={(e) => setFm({ ...fm, [titleField.key]: (e.target as HTMLInputElement).value })} />}
          {kind === 'review' && (item ? <p class="composer__about">About <b>{item.title || item.path.split('/').pop()}</b> <button type="button" class="btn btn--small btn--soft" onClick={() => setItem(null)}>change</button></p> : <RecordPicker type="item" placeholder="What is it about? Start typing a title…" onChange={setItem} />)}
          {kind === 'list-entry' && (
            <div class="fields fields--2">
              <label class="field"><span class="field__label">Which list</span><select value={listHint} onChange={(e) => setListHint((e.target as HTMLSelectElement).value)}><option value="">Choose…</option>{lists.filter((l) => !item?.kind || kindsForList(l).length === 0 || kindsForList(l).includes(item.kind)).map((l) => <option value={l.path.split('/').pop()!}>{l.title ?? l.path}</option>)}</select></label>
              <div class="field"><span class="field__label">What</span>{item ? <p class="composer__about"><b>{item.title || item.path.split('/').pop()}</b> {!preset?.item && <button type="button" class="btn btn--small btn--soft" onClick={() => setItem(null)}>change</button>}</p> : <RecordPicker type="item" placeholder="Start typing a title…" onChange={setItem} />}</div>
            </div>
          )}
          <textarea ref={box} class="composer__box" rows={kind === 'feed' ? 5 : 3} value={text} placeholder={kind === 'feed' ? 'What is on your mind? A link or a photo here gets captured and filed.' : kind === 'list-entry' ? 'Why it is on the list (optional)' : kind === 'review' ? 'What you thought' : 'Start writing…'} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type)); if (files.length) { e.preventDefault(); setPhotos((p) => [...p, ...files]); } }} />
          {capture ? (
            <div class="fields">
              <div class="chips"><span class="mono muted">File as</span>{([['', 'Let the agent decide'], ['list', 'A list'], ['feed', 'Thought'], ['review', 'Review'], ['writing', 'Piece']] as Array<[Intent, string]>).map(([v, l]) => <button type="button" class="chip chip--small" aria-pressed={intent === v} onClick={() => setIntent(v)}>{l}</button>)}
                {intent === 'list' && lists.length > 0 && <select class="sheet__select" value={listHint} onChange={(e) => setListHint((e.target as HTMLSelectElement).value)} aria-label="Which list"><option value="">Agent picks the list</option>{lists.map((l) => <option value={l.path.split('/').pop()!}>{l.title ?? l.path}</option>)}</select>}
              </div>
            </div>
          ) : essentials.length > 0 && <div class="fields fields--2">{essentials.map((f) => <FieldRow key={f.key} f={f} fm={fm} onChange={(k, v) => setFm({ ...fm, [k]: v })} />)}</div>}
          <div class="chips">
            <label class="btn btn--soft btn--small"><input type="file" accept="image/*" multiple hidden onChange={(e) => { setPhotos((p) => [...p, ...[...((e.target as HTMLInputElement).files ?? [])]]); (e.target as HTMLInputElement).value = ''; }} />+ Photo</label>
            {photos.map((f, i) => <span class="chip chip--small" key={i}>{f.name} <button type="button" class="chipin__x" aria-label="remove" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>×</button></span>)}
          </div>
          <details class="more">
            <summary>People, tags{priv ? ' · private' : ''}</summary>
            <div class="fields fields--2">
              <div class="field"><span class="field__label">People</span><ChipInput kind="people" value={people} onChange={setPeople} /><span class="field__hint mono muted">Or type @Name in the text. People never show publicly unless you make them so.</span></div>
              <div class="field"><span class="field__label">Tags</span><ChipInput kind="tags" value={tags} onChange={setTags} /><span class="field__hint mono muted">Or type #tag in the text.</span></div>
              {!capture && fields.more.filter((f) => ['date', 'rating', 'summary', 'draft', 'slug', 'list_type', 'sort', 'form'].includes(f.key)).map((f) => <FieldRow key={f.key} f={f} fm={fm} onChange={(k, v) => setFm({ ...fm, [k]: v })} />)}
            </div>
          </details>
          <div class="sheet__row">
            <span class="seg" role="radiogroup" aria-label="Visibility">
              <button type="button" class="seg__b" aria-pressed={!priv} onClick={() => setPriv(false)}>Public</button>
              <button type="button" class="seg__b" aria-pressed={priv} onClick={() => setPriv(true)}>Private</button>
            </span>
            <span class="mono muted sheet__status">{status}</span>
            {!capture && (kind === 'writing' || kind === 'review') && <button type="button" class="btn" disabled={busy} onClick={() => submit(true)}>Save &amp; keep writing</button>}
            <button type="button" class="btn btn--solid" disabled={busy} onClick={() => submit(false)}>{capture ? (photos.length ? 'Save photos' : 'Send to AI') : kind === 'feed' ? 'Post' : 'Save'}</button>
          </div>
        </>
      )}
    </>
  );
  if (page) return <div class="composer composer--page">{body}</div>;
  return (
    <>
      <button type="button" class="fab" aria-label="New" title="New (⌘⇧N)" onClick={() => show()}>+</button>
      <Sheet open={open} onClose={close} title={editing ? 'Keep writing' : 'New'} wide={!!editing}>{body}</Sheet>
    </>
  );
}
