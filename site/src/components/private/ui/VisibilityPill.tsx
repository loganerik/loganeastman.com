import { useEffect, useState } from 'preact/hooks';
import { setVisibility } from '../api';
import { toast } from './toast';

/** Public | Private, right on the record. Explains what changes and when. */
/** Without an `id` it only reports the choice (the editor saves it with the record); with one it saves at once. */
export default function VisibilityPill({ id, value, type, onChange, small = true }: { id?: string; value: string; type?: string; onChange?: (v: 'public' | 'private') => void; small?: boolean }) {
  const [v, setV] = useState<'public' | 'private'>(value === 'private' ? 'private' : 'public');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(value === 'private' ? 'private' : 'public'); }, [value]);
  const flip = async (next: 'public' | 'private') => {
    if (next === v || busy) return;
    if (!id) { setV(next); onChange?.(next); return; }
    setBusy(true);
    try {
      await setVisibility(id, next, type === 'list');
      setV(next);
      onChange?.(next);
      toast(next === 'private' ? 'Now private · visitors stop seeing it after the next build · you still find it under Private' : 'Now public · live after the next build');
    } catch (e) { toast('Could not change visibility: ' + (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <span class={`seg ${small ? 'seg--small' : ''}`} role="radiogroup" aria-label="Visibility" data-busy={busy || undefined}>
      <button type="button" class="seg__b" aria-pressed={v === 'public'} onClick={() => flip('public')}>Public</button>
      <button type="button" class="seg__b" aria-pressed={v === 'private'} onClick={() => flip('private')}>{v === 'private' ? '🔒 ' : ''}Private</button>
    </span>
  );
}
