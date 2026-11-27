// Owner tools on a list page: the list's own row (visibility, edit, delete) and, for every entry, Edit item /
// Edit note / Done / Remove, all handled here through one delegated click listener. One editor opens for
// whichever entry or item you pick.
import { useEffect, useRef, useState } from 'preact/hooks';
import Editor from './editor/Editor';
import { getRecord, saveRecord } from './api';
import VisibilityPill from './ui/VisibilityPill';
import DeleteButton from './ui/DeleteButton';
import { deleteWithUndo } from './ui/useDelete';
import { toast } from './ui/toast';

export default function ListTools({ listId, listTitle, visibility = 'public' }: { listId?: string; listTitle?: string; visibility?: string }) {
  const [edit, setEdit] = useState<{ id: string; title: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = async (ev: MouseEvent) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-edit], button[data-remove], button[data-state]');
      if (!b) return;
      const row = b.closest<HTMLElement>('[data-entry], .entry');
      if (b.dataset.edit) {
        setEdit({ id: b.dataset.edit, title: b.dataset.editTitle ?? '' });
        setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        return;
      }
      if (b.dataset.remove) {
        deleteWithUndo({ id: b.dataset.remove, title: b.dataset.removeTitle, type: 'list-entry' }, row);
        return;
      }
      if (b.dataset.state) {
        b.disabled = true;
        try {
          const r = await getRecord(b.dataset.state);
          const next = b.dataset.stateTo ?? 'done';
          await saveRecord(r.id, { ...r.frontmatter, state: next, ...(next === 'done' ? { finished: new Date().toISOString().slice(0, 10) } : {}) }, r.body, r.sha);
          if (row) { row.classList.toggle('entry--done', next === 'done'); row.dataset.state = next; }
          toast(next === 'done' ? 'Marked finished · it moves under Finished after the next build' : 'Back on the list · after the next build');
        } catch (e) { b.disabled = false; toast('Could not change it: ' + (e as Error).message); }
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return (
    <div ref={box} class="list-tools">
      {listId && !edit && (
        <p class="chips owner-row owner-row--tight">
          <VisibilityPill id={listId} value={visibility} type="list" />
          <button type="button" class="btn btn--soft btn--small" data-edit={listId} data-edit-title={listTitle ?? 'This list'}>Edit list</button>
          <DeleteButton rec={{ id: listId, title: listTitle, type: 'list' }} target={() => document.querySelector<HTMLElement>('main') ?? null} onDone={() => { location.href = '/lists/'; }} />
        </p>
      )}
      {edit && (
        <div class="inline-edit">
          <p class="mono muted">Editing · {edit.title}</p>
          <Editor key={edit.id} id={edit.id} inline onDone={(saved) => { setEdit(null); if (saved) toast('Saved · the page updates after the next build'); }} onDeleted={() => setEdit(null)} />
        </div>
      )}
    </div>
  );
}
