import { useEffect, useRef, useState } from 'preact/hooks';
import type { ToastDetail } from './toast';

/** Mount once per page (OwnerShell). Shows the latest toast; a replaced toast's onExpire runs at once. */
export default function Toaster() {
  const [t, setT] = useState<(ToastDetail & { key: number }) | null>(null);
  const timer = useRef<number | null>(null);
  const cur = useRef<(ToastDetail & { key: number }) | null>(null);
  const clear = (expire: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const c = cur.current;
    cur.current = null;
    setT(null);
    if (expire) c?.onExpire?.();
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (cur.current) clear(true);
      const next = { ...d, key: Date.now() };
      cur.current = next;
      setT(next);
      timer.current = window.setTimeout(() => clear(true), d.duration ?? (d.action ? 7000 : 4000));
    };
    const flush = () => { if (cur.current) clear(true); };
    window.addEventListener('lem:toast', on);
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('lem:toast', on); window.removeEventListener('pagehide', flush); };
  }, []);
  if (!t) return null;
  return (
    <div class="toast" role="status" key={t.key}>
      <span class="toast__msg">{t.message}</span>
      {t.action && <button type="button" class="toast__act" onClick={() => { const c = cur.current; clear(false); c?.onAction?.(); }}>{t.action}</button>}
      <button type="button" class="toast__x" aria-label="Dismiss" onClick={() => clear(true)}>×</button>
    </div>
  );
}
