// Markdown editor in the reading layout: CodeMirror for the body (Obsidian syntax saved verbatim),
// a small form for the frontmatter, draft recovery, and a conflict dialog on 409. The rich mode lands later.
import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { MergeView } from '@codemirror/merge';
import { api, ApiError, publicUrl, type RecordSummary } from '../api';
import { loadDraft, saveDraft, clearDraft, type Draft } from './drafts';
import { createRichEditor, isLossy, type RichEditor } from './milkdown';
import CoverPanel from './CoverPanel';

interface Loaded { id: string; path: string; type: string; frontmatter: Record<string, unknown>; body: string; raw: string; sha: string; conflict: { ours: string; theirs: string } | null }

const theme = EditorView.theme({
  '&': { fontFamily: 'var(--font-display)', fontSize: 'var(--step-0)', lineHeight: '1.62', background: 'transparent' },
  '.cm-content': { padding: '0.5rem 0', caretColor: 'var(--green)', maxWidth: 'var(--measure)' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { background: 'transparent', border: 0, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' },
  '.cm-activeLine': { background: 'rgb(26 26 24 / 0.03)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit' },
});
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '500', fontSize: '1.3em' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.link, color: 'var(--green)' },
  { tag: tags.url, color: 'var(--ink-faint)' },
  { tag: tags.quote, color: 'var(--ink-soft)', fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: tags.processingInstruction, color: 'var(--ink-faint)' },
]);

type Field = { key: string; label: string; kind: 'text' | 'date' | 'bool' | 'select' | 'tags' | 'number'; options?: string[] };
function fieldsFor(type: string, cfg: { collections: Array<{ key: string; title: string }>; listTypes: Array<{ key: string; title: string }> } | null): Field[] {
  const vis: Field = { key: 'visibility', label: 'Visibility', kind: 'select', options: ['public', 'private'] };
  const tagsF: Field = { key: 'tags', label: 'Tags', kind: 'tags' };
  switch (type) {
    case 'writing': return [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'collection', label: 'Collection', kind: 'select', options: cfg?.collections.map((c) => c.key) ?? [] }, { key: 'date', label: 'Date', kind: 'date' }, { key: 'summary', label: 'Summary', kind: 'text' }, { key: 'draft', label: 'Draft', kind: 'bool' }, vis, tagsF];
    case 'feed': return [{ key: 'title', label: 'Title (optional)', kind: 'text' }, { key: 'date', label: 'Date', kind: 'date' }, { key: 'about', label: 'About [[record]]', kind: 'text' }, { key: 'draft', label: 'Draft', kind: 'bool' }, vis, tagsF];
    case 'review': return [{ key: 'title', label: 'Title (optional)', kind: 'text' }, { key: 'item', label: 'Item [[record]]', kind: 'text' }, { key: 'date', label: 'Date', kind: 'date' }, { key: 'rating', label: 'Rating', kind: 'number' }, { key: 'draft', label: 'Draft', kind: 'bool' }, vis, tagsF];
    case 'list': return [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'list_type', label: 'List type', kind: 'select', options: cfg?.listTypes.map((c) => c.key) ?? [] }, { key: 'sort', label: 'Sort', kind: 'select', options: ['added-desc', 'added-asc', 'title', 'manual'] }, vis];
    case 'list-entry': return [{ key: 'state', label: 'State', kind: 'select', options: ['active', 'done', 'removed'] }, { key: 'added', label: 'Added', kind: 'date' }, { key: 'for', label: 'For [[person]] (gifts)', kind: 'text' }, vis];
    case 'item': return [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'year', label: 'Year', kind: 'number' }, { key: 'finished', label: 'Finished on', kind: 'date' }, { key: 'url', label: 'URL', kind: 'text' }, vis, tagsF];
    case 'person': return [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'public_alias', label: 'Public alias', kind: 'text' }, vis];
    case 'tag': return [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'description', label: 'Description', kind: 'text' }, vis];
    default: return [vis];
  }
}

export default function Editor(props: { id?: string; inline?: boolean; onDone?: (saved: boolean) => void }) {
  const id = props.id || new URLSearchParams(location.search).get('id') || '';
  const inline = !!props.inline;
  const [savedOnce, setSavedOnce] = useState(false);
  const [rec, setRec] = useState<Loaded | null>(null);
  const [cfg, setCfg] = useState<{ collections: Array<{ key: string; title: string }>; listTypes: Array<{ key: string; title: string }>; site: { rating_scale: number } } | null>(null);
  const [fm, setFm] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<{ current: { frontmatter: Record<string, unknown>; body: string; raw: string; sha: string } } | null>(null);
  const [artwork, setArtwork] = useState<Record<string, unknown> | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const richHost = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const rich = useRef<RichEditor | null>(null);
  const [mode, setMode] = useState<'rich' | 'markdown'>(() => (new URLSearchParams(location.search).get('mode') === 'markdown' ? 'markdown' : 'rich'));
  const [lossy, setLossy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    Promise.all([api<Loaded>(`/api/records/${id}`), api('/api/config')]).then(async ([r, c]) => {
      setRec(r); setCfg(c as never); setFm(r.frontmatter); setBody(r.body); setSha(r.sha);
      const why = isLossy(r.body) || (r.conflict ? 'conflict markers' : null);
      setLossy(why);
      if (why) setMode('markdown');
      setArtwork((r.frontmatter.artwork as Record<string, unknown>) ?? null);
      const d = await loadDraft(id);
      if (d && (d.baseSha !== r.sha || d.body !== r.body || JSON.stringify(d.frontmatter) !== JSON.stringify(r.frontmatter))) setDraft(d);
    }).catch((e) => setStatus((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (!rec || mode !== 'markdown' || !host.current || view.current) return;
    view.current = new EditorView({
      state: EditorState.create({
        doc: rec.body,
        extensions: [history(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, { key: 'Mod-s', run: () => { save(); return true; } }]), markdown({ base: markdownLanguage }), syntaxHighlighting(highlight), theme, lineNumbers(), highlightActiveLine(), EditorView.lineWrapping, placeholder('Write here. [[Wikilinks]], ![[embeds]], > [!note] callouts and ==highlights== are kept as Obsidian writes them.'),
          EditorView.updateListener.of((u) => { if (u.docChanged) { setBody(u.state.doc.toString()); setDirty(true); } })],
      }),
      parent: host.current,
    });
    return () => { view.current?.destroy(); view.current = null; };
  }, [rec, mode]);

  useEffect(() => {
    if (!rec || mode !== 'rich' || !richHost.current) return;
    let alive = true;
    createRichEditor(richHost.current, bodyRef.current, (md) => { setBody(md); setDirty(true); }).then((r) => { if (!alive) r.destroy(); else rich.current = r; });
    return () => { alive = false; rich.current?.destroy(); rich.current = null; };
  }, [rec, mode]);

  // paste / drop images → upload → embed
  useEffect(() => {
    const el = richHost.current ?? host.current;
    if (!el || !rec) return;
    const upload = async (files: File[]) => {
      const imgs = files.filter((f) => /^image\//.test(f.type));
      if (!imgs.length) return;
      setUploading(true);
      try {
        for (const f of imgs) {
          const fd = new FormData(); fd.append('file', f); fd.append('record_id', rec.id);
          const r = await fetch('/api/assets', { method: 'POST', body: fd, credentials: 'include' });
          const j = (await r.json()) as { embed?: string; thumb?: { url: string }; media_id?: string; error?: string };
          if (!r.ok || !j.embed) { setStatus(`Upload failed: ${j.error ?? r.status}`); continue; }
          const target = j.embed.replace(/^!\[\[|\]\]$/g, '').split('|')[0]!;
          if (mode === 'rich' && rich.current) rich.current.insertEmbed(target, '', `/api/media/${j.media_id}/original`);
          else { const v = view.current; if (v) { const pos = v.state.selection.main.head; v.dispatch({ changes: { from: pos, insert: `\n${j.embed}\n` } }); } }
          setDirty(true);
        }
      } finally { setUploading(false); }
    };
    const onPaste = (e: ClipboardEvent) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.some((f) => /^image\//.test(f.type))) { e.preventDefault(); upload(files); } };
    const onDrop = (e: DragEvent) => { const files = [...(e.dataTransfer?.files ?? [])]; if (files.some((f) => /^image\//.test(f.type))) { e.preventDefault(); upload(files); } };
    const onDrag = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    el.addEventListener('paste', onPaste); el.addEventListener('drop', onDrop); el.addEventListener('dragover', onDrag);
    return () => { el.removeEventListener('paste', onPaste); el.removeEventListener('drop', onDrop); el.removeEventListener('dragover', onDrag); };
  }, [rec, mode]);

  const switchMode = (m: 'rich' | 'markdown') => {
    if (m === mode) return;
    if (mode === 'rich' && rich.current) { const md = rich.current.getMarkdown(); bodyRef.current = md; setBody(md); }
    setMode(m);
  };

  // autosave draft
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => saveDraft(id, { frontmatter: fm, body: bodyRef.current, baseSha: sha, savedAt: Date.now(), mode: 'markdown' }), 1000);
    return () => clearTimeout(t);
  }, [fm, body, dirty]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', h);
    return () => removeEventListener('beforeunload', h);
  }, [dirty]);

  const setDoc = (text: string) => { bodyRef.current = text; setBody(text); const v = view.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); if (mode === 'rich') { setMode('markdown'); setTimeout(() => setMode('rich'), 0); } };

  async function save(override?: { baseSha?: string }) {
    if (!rec) return;
    if (mode === 'rich' && rich.current) bodyRef.current = rich.current.getMarkdown();
    setStatus('Saving…');
    try {
      const r = await api<{ sha: string; status: string }>(`/api/records/${rec.id}`, { method: 'PUT', body: JSON.stringify({ frontmatter: { ...fm, artwork: artwork ?? undefined }, body: bodyRef.current, base_sha: override?.baseSha ?? sha ?? undefined }) });
      setSha(r.sha); setDirty(false); setConflict(null); setSavedOnce(true); await clearDraft(rec.id);
      setStatus(r.status === 'skipped' ? 'No changes' : `Saved ${new Date().toLocaleTimeString()} · live in a couple of minutes`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setConflict(e.body as never); setStatus('Changed elsewhere since you opened it'); }
      else setStatus(`Not saved: ${(e as Error).message}`);
    }
  }

  if (!rec) return <p class="muted">{status || 'Loading…'}</p>;
  const fields = fieldsFor(rec.type, cfg);
  const summary: RecordSummary = { id: rec.id, path: rec.path, type: rec.type, kind: (fm.kind as string) ?? null, title: (fm.title as string) ?? null, visibility: (fm.visibility as string) ?? null, draft: !!fm.draft, date: null, collection: (fm.collection as string) ?? null, list_type: null, year: null, conflict: false, excerpt: null, tags: [] };
  const url = fm.visibility === 'public' && !fm.draft ? publicUrl(summary) : null;
  return (
    <div class="editor">
      {draft && (
        <div class="banner">
          <span>Unsaved draft from {new Date(draft.savedAt).toLocaleString()}.</span>
          <button class="btn" onClick={() => { setFm(draft.frontmatter); setDoc(draft.body); setDirty(true); setDraft(null); }}>Restore</button>
          <button class="btn" onClick={() => { clearDraft(id); setDraft(null); }}>Discard</button>
        </div>
      )}
      {rec.conflict && <div class="banner banner--warn">This file has git conflict markers. <a href={`/private/?tab=conflicts`}>Resolve it</a> first, or edit the raw text carefully.</div>}
      {inline ? (
        <div class="toolbar toolbar--inline">
          <div class="chips">
            <button type="button" class="btn" onClick={() => { if (dirty && !confirm('Discard unsaved changes?')) return; props.onDone?.(savedOnce); }}>Done</button>
            <button type="button" class="btn btn--solid" onClick={() => save()}>Save changes</button>
            <button type="button" class="btn" aria-pressed={mode === 'markdown'} disabled={!!lossy && mode === 'markdown'} onClick={() => switchMode(mode === 'rich' ? 'markdown' : 'rich')}>{mode === 'rich' ? 'Markdown' : 'Rich text'}</button>
            <label class="btn"><input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; const el = richHost.current ?? host.current; if (el && files.length) { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); } }} />Add photos</label>
            <button type="button" class="btn" aria-pressed={showMeta} onClick={() => setShowMeta(!showMeta)}>Cover</button>
            <span class="mono muted toolbar__status">{status}{dirty && !status.startsWith('Saving') ? ' · unsaved' : ''}</span>
          </div>
          {mode === 'rich' && (
            <div class="chips">
              <button type="button" class="btn" onClick={() => rich.current?.cmd('bold')}>Bold</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('italic')}>Italic</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('h2')}>Heading</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('text')}>Paragraph</button>
              <button type="button" class="btn" onClick={() => { const href = prompt('Link URL'); if (href) rich.current?.cmd('link', { href }); }}>Link</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('ul')}>Bullets</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('ol')}>Numbered</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('quote')}>Quote</button>
            </div>
          )}
        </div>
      ) : (
      <div class="editor__bar mono">
        <span class="muted">{rec.type} · {rec.path}</span>
        <span class="editor__status">{status}{dirty && !status.startsWith('Saving') ? ' · unsaved' : ''}</span>
        <span class="editor__actions">
          {url && <a href={url} target="_blank" rel="noopener">View</a>}
          <button class="btn btn--solid" onClick={() => save()}>Save</button>
        </span>
      </div>
      )}
      {inline && <p class="mono muted editor__kicker">{String(fm.collection ?? fm.kind ?? rec.type)} · {String(fm.visibility ?? 'public')}{fm.draft ? ' · draft' : ''}</p>}
      {inline && (fm.title !== undefined || rec.type === 'writing') && <input class="editor__title" value={String(fm.title ?? '')} placeholder="Title" onInput={(e) => { setFm({ ...fm, title: (e.target as HTMLInputElement).value }); setDirty(true); }} />}
      <form class="fm" hidden={inline && !showMeta} onSubmit={(e) => { e.preventDefault(); save(); }}>
        {fields.map((f) => {
          const v = fm[f.key];
          const upd = (val: unknown) => { setFm({ ...fm, [f.key]: val === '' ? undefined : val }); setDirty(true); };
          if (f.kind === 'bool') return <label class="fm__f fm__f--bool" key={f.key}><input type="checkbox" checked={!!v} onChange={(e) => upd((e.target as HTMLInputElement).checked)} /> <span class="mono">{f.label}</span></label>;
          if (f.kind === 'select') return <label class="fm__f" key={f.key}><span class="mono">{f.label}</span><select value={String(v ?? '')} onChange={(e) => upd((e.target as HTMLSelectElement).value)}>{f.options!.map((o) => <option value={o}>{o}</option>)}</select></label>;
          if (f.kind === 'tags') return <label class="fm__f" key={f.key}><span class="mono">{f.label}</span><input value={Array.isArray(v) ? (v as string[]).join(', ') : ''} placeholder="comma, separated, private/secret" onInput={(e) => upd((e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean))} /></label>;
          if (f.kind === 'number') return <label class="fm__f" key={f.key}><span class="mono">{f.label}</span><input type="number" step="any" value={v == null ? '' : String(v)} onInput={(e) => upd((e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value))} /></label>;
          if (f.kind === 'date') return <label class="fm__f" key={f.key}><span class="mono">{f.label}</span><input type="date" value={String(v ?? '').slice(0, 10)} onInput={(e) => upd((e.target as HTMLInputElement).value)} /></label>;
          return <label class={`fm__f ${f.key === 'title' || f.key === 'name' ? 'fm__f--title' : ''}`} key={f.key}><span class="mono">{f.label}</span><input value={String(v ?? '')} onInput={(e) => upd((e.target as HTMLInputElement).value)} /></label>;
        })}
      </form>
      {(rec.type === 'item' || rec.type === 'writing' || rec.type === 'feed' || rec.type === 'review') && (
        <details class="artwork" open={!inline || showMeta || !artwork} hidden={inline && !showMeta && !!artwork}>
          <summary class="mono">Cover &amp; artwork {artwork?.treatment ? `· ${artwork.treatment}` : ''}</summary>
          <CoverPanel recordId={rec.id} type={rec.type} kind={fm.kind as string | undefined} body={body} cover={fm.cover as string | undefined} artwork={artwork as never} approved={fm.approved as boolean | undefined}
            onChange={(n) => { setArtwork(n.artwork); setFm({ ...fm, cover: n.cover, ...(n.approved !== undefined ? { approved: n.approved } : {}) }); setDirty(true); }} onStatus={setStatus} />
        </details>
      )}
      <div class="toolbar mono" role="toolbar" aria-label="Formatting" hidden={inline}>
        {mode === 'rich' && (<>
          <button type="button" onClick={() => rich.current?.cmd('h2')} title="Heading 2">H2</button>
          <button type="button" onClick={() => rich.current?.cmd('h3')} title="Heading 3">H3</button>
          <button type="button" onClick={() => rich.current?.cmd('text')} title="Plain paragraph">¶</button>
          <span class="toolbar__sep" />
          <button type="button" onClick={() => rich.current?.cmd('bold')} title="Bold (⌘B)"><b>B</b></button>
          <button type="button" onClick={() => rich.current?.cmd('italic')} title="Italic (⌘I)"><i>I</i></button>
          <button type="button" onClick={() => rich.current?.cmd('strike')} title="Strikethrough"><s>S</s></button>
          <button type="button" onClick={() => rich.current?.cmd('code')} title="Inline code">{'</>'}</button>
          <button type="button" onClick={() => { const href = prompt('Link URL'); if (href) rich.current?.cmd('link', { href }); }} title="Link">Link</button>
          <span class="toolbar__sep" />
          <button type="button" onClick={() => rich.current?.cmd('quote')} title="Quote">“ ”</button>
          <button type="button" onClick={() => rich.current?.cmd('ul')} title="Bullet list">• List</button>
          <button type="button" onClick={() => rich.current?.cmd('ol')} title="Numbered list">1. List</button>
          <button type="button" onClick={() => rich.current?.cmd('hr')} title="Rule">—</button>
          <label class="toolbar__upload" title="Insert image"><input type="file" accept="image/*" multiple onChange={(e) => { const files = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; const el = richHost.current; if (el && files.length) { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); } }} />Image</label>
        </>)}
        <span class="toolbar__spacer" />
        {uploading && <span class="muted">uploading…</span>}
        <span class="toolbar__modes">
          <button type="button" aria-pressed={mode === 'rich'} onClick={() => switchMode('rich')} disabled={!!lossy} title={lossy ? `Rich mode is off: this note uses ${lossy}` : 'Rich text'}>Rich</button>
          <button type="button" aria-pressed={mode === 'markdown'} onClick={() => switchMode('markdown')}>Markdown</button>
        </span>
      </div>
      {lossy && mode === 'markdown' && <p class="mono muted lossy">Opened in Markdown mode because this note uses {lossy}, which the rich editor would not preserve.</p>}
      {mode === 'rich' ? <div class="editor__body editor__body--rich" ref={richHost} /> : <div class="editor__body prose" ref={host} />}
      {conflict && (
        <ConflictDialog mine={{ frontmatter: fm, body }} theirs={conflict.current}
          onKeepMine={() => save({ baseSha: conflict.current.sha })}
          onTakeTheirs={() => { setFm(conflict.current.frontmatter); setDoc(conflict.current.body); setSha(conflict.current.sha); setConflict(null); setDirty(false); clearDraft(id); setStatus('Loaded the newer version'); }}
          onClose={() => setConflict(null)} />
      )}
    </div>
  );
}

function ConflictDialog({ mine, theirs, onKeepMine, onTakeTheirs, onClose }: { mine: { frontmatter: Record<string, unknown>; body: string }; theirs: { body: string; sha: string }; onKeepMine: () => void; onTakeTheirs: () => void; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const mv = new MergeView({ a: { doc: theirs.body, extensions: [EditorView.editable.of(false), theme, EditorView.lineWrapping] }, b: { doc: mine.body, extensions: [EditorView.editable.of(false), theme, EditorView.lineWrapping] }, parent: host.current });
    return () => mv.destroy();
  }, []);
  return (
    <dialog open class="conflict">
      <p class="mono">Someone (you, in Obsidian?) changed this file since you opened it.</p>
      <p class="mono muted">Left: the version in the vault now · Right: yours</p>
      <div class="conflict__merge" ref={host} />
      <p class="conflict__actions"><button class="btn btn--solid" onClick={onKeepMine}>Keep mine (overwrite)</button> <button class="btn" onClick={onTakeTheirs}>Take theirs (discard mine)</button> <button class="btn" onClick={onClose}>Decide later</button></p>
    </dialog>
  );
}
