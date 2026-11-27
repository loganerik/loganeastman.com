// Delete the way a person expects: the thing disappears now, Undo is offered for a few seconds, the vault changes
// only once the offer lapses. Lists (and items on lists) ask first because they take their entries with them.
import { deleteRecord, type DeleteDryRun } from '../api';
import { toast } from './toast';
import { confirmSheet } from './confirm';

export interface Deletable { id: string; title?: string | null; type?: string | null }

export async function deleteWithUndo(rec: Deletable, el?: HTMLElement | null, opts: { onDone?: () => void; onUndo?: () => void } = {}): Promise<boolean> {
  let cascade = false;
  if (rec.type === 'list' || rec.type === 'item') {
    const dry = (await deleteRecord(rec.id, { dryRun: true }).catch(() => null)) as DeleteDryRun | null;
    if (dry && dry.entries > 0) {
      const what = rec.type === 'list' ? `Delete “${rec.title ?? 'this list'}” and its ${dry.entries} ${dry.entries === 1 ? 'entry' : 'entries'}?` : `Delete “${rec.title ?? 'this'}” and remove it from ${dry.entries} ${dry.entries === 1 ? 'list' : 'lists'}?`;
      const ok = await confirmSheet({ title: what, text: rec.type === 'list' ? `The ${dry.items_kept} things on it stay in your collection.` : dry.reviews ? `Your ${dry.reviews} review${dry.reviews === 1 ? '' : 's'} of it stay.` : undefined, ok: 'Delete', danger: true });
      if (!ok) return false;
      cascade = true;
    }
  }
  if (el) el.hidden = true;
  toast(`Deleted “${rec.title ?? 'it'}” · gone from the site after the next build`, {
    action: 'Undo',
    onAction: () => { if (el) el.hidden = false; opts.onUndo?.(); },
    onExpire: () => { deleteRecord(rec.id, { cascade, keepalive: true }).then(() => opts.onDone?.()).catch((e: Error) => { if (el) el.hidden = false; toast('Could not delete: ' + e.message); }); },
  });
  return true;
}
