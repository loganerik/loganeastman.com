import { deleteWithUndo, type Deletable } from './useDelete';
export default function DeleteButton({ rec, target, onDone, label = 'Delete', class: cls = 'btn btn--soft btn--small' }: { rec: Deletable; target?: string | (() => HTMLElement | null); onDone?: () => void; label?: string; class?: string }) {
  return <button type="button" class={cls} onClick={(e) => {
    const near = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-article], [data-entry], .card, li');
    const el = typeof target === 'function' ? (target() ?? near) : target ? document.querySelector<HTMLElement>(target) : near;
    deleteWithUndo(rec, el, { onDone });
  }}>{label}</button>;
}
