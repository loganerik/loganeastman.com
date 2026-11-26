// "Edit" on a reading page: swaps the static article for the editor, in the same layout.
import { useState } from 'preact/hooks';
import Editor from './Editor';

export default function InlineEdit({ recordId, articleSelector = '[data-article]', extra }: { recordId: string; articleSelector?: string; extra?: Array<{ label: string; href: string }> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const toggle = (on: boolean) => {
    document.querySelectorAll<HTMLElement>(articleSelector).forEach((el) => { el.hidden = on; });
    setOpen(on);
  };
  if (!open) {
    return (
      <p class="chips owner-row">
        <button type="button" class="btn btn--soft" onClick={() => toggle(true)}>Edit</button>
        {extra?.map((x) => <a class="btn" href={x.href}>{x.label}</a>)}
        {note && <span class="mono muted">{note}</span>}
      </p>
    );
  }
  return (
    <div class="inline-edit">
      <Editor id={recordId} inline onDone={(saved) => { toggle(false); if (saved) setNote('Saved · the page updates after the next build'); }} />
    </div>
  );
}
