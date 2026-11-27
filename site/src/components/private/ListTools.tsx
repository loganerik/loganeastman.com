// Owner tools on a list page: one editor that opens for whichever entry or item you pick, and Remove.
import { useEffect, useRef, useState } from 'preact/hooks';
import Editor from './editor/Editor';
import { api } from './api';

export default function ListTools() {
  const [edit, setEdit] = useState<{ id: string; title: string } | null>(null);
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = async (ev: MouseEvent) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-edit], button[data-remove]');
      if (!b) return;
      if (b.dataset.edit) {
        setEdit({ id: b.dataset.edit, title: b.dataset.editTitle ?? '' });
        setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        return;
      }
      if (!confirm(`Remove "${b.dataset.removeTitle}" from this list? The item itself stays.`)) return;
      b.disabled = true;
      try {
        await api(`/api/records/${b.dataset.remove}`, { method: 'DELETE' });
        b.closest('[data-entry], .entry')?.remove();
        setNote('Removed · the page updates after the next build');
      } catch (e) {
        b.disabled = false;
        alert('Could not remove: ' + (e as Error).message);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return (
    <div ref={box} class="list-tools">
      {note && !edit && <p class="mono muted">{note}</p>}
      {edit && (
        <div class="inline-edit">
          <p class="mono muted">Editing · {edit.title}</p>
          <Editor key={edit.id} id={edit.id} inline onDone={(saved) => { setEdit(null); if (saved) setNote('Saved · the page updates after the next build'); }} />
        </div>
      )}
    </div>
  );
}
