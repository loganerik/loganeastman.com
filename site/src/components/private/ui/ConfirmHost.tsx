import { useEffect, useState } from 'preact/hooks';
import Sheet from './Sheet';
import type { ConfirmOpts } from './confirm';

export default function ConfirmHost() {
  const [c, setC] = useState<(ConfirmOpts & { resolve: (ok: boolean) => void }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => setC((e as CustomEvent).detail);
    window.addEventListener('lem:confirm', on);
    return () => window.removeEventListener('lem:confirm', on);
  }, []);
  const done = (ok: boolean) => { c?.resolve(ok); setC(null); };
  return (
    <Sheet open={!!c} onClose={() => done(false)} title={c?.title}>
      {c?.text && <p class="confirm__text">{c.text}</p>}
      <div class="sheet__row">
        <span class="sheet__status" />
        <button type="button" class="btn" onClick={() => done(false)}>{c?.cancel ?? 'Keep it'}</button>
        <button type="button" class={`btn ${c?.danger ? 'btn--danger' : 'btn--solid'}`} onClick={() => done(true)}>{c?.ok ?? 'OK'}</button>
      </div>
    </Sheet>
  );
}
