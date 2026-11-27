import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** The owner's dialog shell: a bottom sheet on phones, a centred card on wider screens. */
export default function Sheet({ open, onClose, title, children, wide = false, class: cls = '' }: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren; wide?: boolean; class?: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={dlg} class={`sheet ${wide ? 'sheet--wide' : ''} ${cls}`} onClose={onClose} onClick={(e) => { if (e.target === dlg.current) onClose(); }}>
      <div class="sheet__form">
        {title && <div class="sheet__head"><h2 class="sheet__title">{title}</h2><button type="button" class="sheet__close" aria-label="Close" onClick={onClose}>×</button></div>}
        {children}
      </div>
    </dialog>
  );
}
