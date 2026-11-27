// Owner controls on a reading page: Edit swaps the static article for the editor in the same layout; the pill
// flips visibility at once; Delete hides the piece now and removes it when the Undo window lapses.
import { useState } from 'preact/hooks';
import Editor from './Editor';
import VisibilityPill from '../ui/VisibilityPill';
import DeleteButton from '../ui/DeleteButton';

export default function InlineEdit({ recordId, articleSelector = '[data-article]', extra, visibility = 'public', title, type }: { recordId: string; articleSelector?: string; extra?: Array<{ label: string; href?: string; onClick?: () => void; compose?: string; item?: string; itemTitle?: string; itemKind?: string; list?: string }>; visibility?: string; title?: string; type?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [gone, setGone] = useState(false);
  const articles = () => [...document.querySelectorAll<HTMLElement>(articleSelector)];
  const toggle = (on: boolean) => { articles().forEach((el) => { el.hidden = on; }); setOpen(on); };
  if (gone) return null;
  if (!open) {
    return (
      <p class="chips owner-row">
        <button type="button" class="btn btn--soft" onClick={() => toggle(true)}>Edit</button>
        <VisibilityPill id={recordId} value={visibility} type={type} />
        <DeleteButton rec={{ id: recordId, title, type }} target={() => articles()[0] ?? null} onDone={() => setGone(true)} />
        {extra?.map((x) => x.href ? <a class="btn" href={x.href}>{x.label}</a> : <button type="button" class="btn" data-compose={x.compose} data-item={x.item} data-item-title={x.itemTitle} data-item-kind={x.itemKind} data-list={x.list} onClick={x.onClick}>{x.label}</button>)}
        {note && <span class="mono muted">{note}</span>}
      </p>
    );
  }
  return (
    <div class="inline-edit">
      <Editor id={recordId} inline onDone={(saved) => { toggle(false); if (saved) setNote('Saved · the page updates after the next build'); }} onDeleted={() => { setOpen(false); }} />
    </div>
  );
}
