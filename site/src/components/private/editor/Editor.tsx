// The record editor, inline on a reading page or on /private/edit/. Rich text (Milkdown) or Markdown (CodeMirror,
// Obsidian syntax saved verbatim), the essentials of the frontmatter up front and the rest under More, draft
// recovery, delete with undo, and a conflict dialog on 409.
import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { MergeView } from '@codemirror/merge';
import { api, ApiError, publicUrl, humanKind, getConfig, type RecordSummary, type Config, type Loaded } from '../api';
import { fieldsFor } from './fields';
import FieldRow from './FieldRow';
import VisibilityPill from '../ui/VisibilityPill';
import { deleteWithUndo } from '../ui/useDelete';
import { confirmSheet } from '../ui/confirm';
import { syncMentions, ensurePeople, extractMentions } from './mentions';
import { peopleFromRelated } from './fields';
import { loadDraft, saveDraft, clearDraft, type Draft } from './drafts';
import { createRichEditor, isLossy, type RichEditor } from './milkdown';
import CoverPanel from './CoverPanel';


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

export default function Editor(props: { id?: string; inline?: boolean; record?: Loaded; onDone?: (saved: boolean) => void; onDeleted?: () => void }) {
  const id = props.id || props.record?.id || new URLSearchParams(location.search).get('id') || '';
  const inline = !!props.inline;
  const [savedOnce, setSavedOnce] = useState(false);
  const [rec, setRec] = useState<Loaded | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [showCover, setShowCover] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
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
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    Promise.all([props.record ? Promise.resolve(props.record) : api<Loaded>(`/api/records/${id}`), getConfig()]).then(async ([r, c]) => {
      setRec(r); setCfg(c); setFm(r.frontmatter); setBody(r.body); setSha(r.sha);
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
      const merged = syncMentions({ ...fm, artwork: artwork ?? undefined }, bodyRef.current);
      const newPeople = extractMentions(bodyRef.current).people.filter((p) => !peopleFromRelated(fm.related).includes(p));
      if (newPeople.length) await ensurePeople(newPeople);
      if (merged.tags !== fm.tags || merged.related !== fm.related) setFm((f) => ({ ...f, tags: merged.tags, related: merged.related }));
      const r = await api<{ sha: string; status: string }>(`/api/records/${rec.id}`, { method: 'PUT', body: JSON.stringify({ frontmatter: merged, body: bodyRef.current, base_sha: override?.baseSha ?? sha ?? undefined }) });
      setSha(r.sha); setDirty(false); setConflict(null); setSavedOnce(true); await clearDraft(rec.id);
      setStatus(r.status === 'skipped' ? 'No changes' : `Saved ${new Date().toLocaleTimeString()} · live in a couple of minutes`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setConflict(e.body as never); setStatus('Changed elsewhere since you opened it'); }
      else setStatus(`Not saved: ${(e as Error).message}`);
    }
  }

  if (!rec) return <p class="muted">{status || 'Loading…'}</p>;
  const fields = fieldsFor(rec.type, cfg, fm.kind as string | undefined);
  const setField = (key: string, value: unknown) => { setFm((f) => ({ ...f, [key]: value })); setDirty(true); };
  const hasCover = rec.type === 'item' || rec.type === 'writing' || rec.type === 'feed' || rec.type === 'review' || rec.type === 'list';
  const del = async () => {
    const ok = await deleteWithUndo({ id: rec.id, title: (fm.title ?? fm.name ?? rec.path.split('/').pop()) as string, type: rec.type }, null, { onDone: () => { if (!inline) location.href = '/private/'; } });
    if (ok) { if (inline) props.onDeleted?.(); else setStatus('Deleted · undo from the toast'); }
  };
  const summary: RecordSummary = { id: rec.id, path: rec.path, type: rec.type, kind: (fm.kind as string) ?? null, title: (fm.title as string) ?? null, visibility: (fm.visibility as string) ?? null, draft: !!fm.draft, date: null, collection: (fm.collection as string) ?? null, list_type: null, year: null, conflict: false, excerpt: null, tags: [] };
  const url = fm.visibility !== 'private' && !fm.draft ? publicUrl(summary) : null;
  const kindLabel = humanKind({ type: rec.type, kind: fm.kind as string, collection: fm.collection as string, list_type: fm.list_type as string }, cfg);
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
            <button type="button" class="btn" onClick={async () => { if (dirty && !(await confirmSheet({ title: 'Leave without saving?', text: 'Your changes since the last save will be lost.', ok: 'Leave', cancel: 'Keep editing', danger: true }))) return; props.onDone?.(savedOnce); }}>Done</button>
            <button type="button" class="btn btn--solid" onClick={() => save()}>Save</button>
            <VisibilityPill value={String(fm.visibility ?? 'public')} onChange={(v) => setField('visibility', v)} />
            <button type="button" class="btn btn--soft" onClick={del}>Delete</button>
            <button type="button" class="btn" aria-pressed={mode === 'markdown'} disabled={!!lossy && mode === 'markdown'} onClick={() => switchMode(mode === 'rich' ? 'markdown' : 'rich')}>{mode === 'rich' ? 'Markdown' : 'Rich text'}</button>
            <label class="btn"><input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; const el = richHost.current ?? host.current; if (el && files.length) { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); } }} />Add photos</label>
            {hasCover && <button type="button" class="btn" aria-pressed={showCover} onClick={() => setShowCover(!showCover)}>Cover</button>}
            <span class="mono muted toolbar__status">{status}{dirty && !status.startsWith('Saving') ? ' · unsaved' : ''}</span>
          </div>
          {mode === 'rich' && (
            <div class="chips">
              <button type="button" class="btn" onClick={() => rich.current?.cmd('bold')}>Bold</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('italic')}>Italic</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('h2')}>Heading</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('text')}>Paragraph</button>
              <button type="button" class="btn" aria-pressed={linkOpen} onClick={() => setLinkOpen(!linkOpen)}>Link</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('ul')}>Bullets</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('ol')}>Numbered</button>
              <button type="button" class="btn" onClick={() => rich.current?.cmd('quote')}>Quote</button>
            </div>
          )}
          {linkOpen && <form class="chips" onSubmit={(e) => { e.preventDefault(); if (linkHref) rich.current?.cmd('link', { href: linkHref }); setLinkHref(''); setLinkOpen(false); }}><input class="picker__in" placeholder="https://…" value={linkHref} onInput={(e) => setLinkHref((e.target as HTMLInputElement).value)} autofocus /><button type="submit" class="btn btn--solid btn--small">Add link</button></form>}
        </div>
      ) : (
      <div class="editor__bar mono">
        <span class="muted"><a href="/private/">Private</a> · {kindLabel}{fm.title || fm.name ? ` · ${String(fm.title ?? fm.name)}` : ''}</span>
        <span class="editor__status">{status}{dirty && !status.startsWith('Saving') ? ' · unsaved' : ''}</span>
        <span class="editor__actions">
          <VisibilityPill value={String(fm.visibility ?? 'public')} onChange={(v) => setField('visibility', v)} />
          <button type="button" class="btn btn--soft" onClick={del}>Delete</button>
          {url && <a class="btn" href={url} target="_blank" rel="noopener">View</a>}
          <button class="btn btn--solid" onClick={() => save()}>Save</button>
        </span>
      </div>
      )}
      <p class="mono muted editor__kicker">{kindLabel}{fm.visibility === 'private' ? ' · private' : ''}{fm.draft ? ' · draft' : ''}</p>
      {(fm.title !== undefined || rec.type === 'writing' || rec.type === 'item' || rec.type === 'list') && <input class="editor__title" value={String(fm.title ?? '')} placeholder="Title" onInput={(e) => setField('title', (e.target as HTMLInputElement).value)} />}
      {(fm.name !== undefined || rec.type === 'person' || rec.type === 'tag') && <input class="editor__title" value={String(fm.name ?? '')} placeholder="Name" onInput={(e) => setField('name', (e.target as HTMLInputElement).value)} />}
      {fields.essentials.filter((f) => f.key !== 'title' && f.key !== 'name').length > 0 && (
        <form class="fields fields--2 editor__fields" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {fields.essentials.filter((f) => f.key !== 'title' && f.key !== 'name').map((f) => <FieldRow key={f.key} f={f} fm={fm} onChange={setField} />)}
        </form>
      )}
      {fields.more.length > 0 && (
        <details class="more editor__more">
          <summary>More{fm.visibility === 'private' ? ' · private' : ''}{Array.isArray(fm.tags) && (fm.tags as string[]).length ? ` · ${(fm.tags as string[]).length} tag${(fm.tags as string[]).length === 1 ? '' : 's'}` : ''}</summary>
          <div class="fields fields--2">{fields.more.map((f) => <FieldRow key={f.key} f={f} fm={fm} onChange={setField} />)}</div>
        </details>
      )}
      {(rec.type === 'item' || rec.type === 'writing' || rec.type === 'feed' || rec.type === 'review' || rec.type === 'list') && (
        <details class="artwork" open={!inline || showCover} hidden={inline && !showCover}>
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
          <button type="button" aria-pressed={linkOpen} onClick={() => setLinkOpen(!linkOpen)} title="Link">Link</button>
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
      {!inline && linkOpen && <form class="chips" onSubmit={(e) => { e.preventDefault(); if (linkHref) rich.current?.cmd('link', { href: linkHref }); setLinkHref(''); setLinkOpen(false); }}><input class="picker__in" placeholder="https://…" value={linkHref} onInput={(e) => setLinkHref((e.target as HTMLInputElement).value)} autofocus /><button type="submit" class="btn btn--solid btn--small">Add link</button></form>}
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
