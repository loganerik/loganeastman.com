// One toast at a time, with an optional action (Undo) and an expiry callback (what to do once Undo is no longer offered).
export interface ToastOpts { action?: string; onAction?: () => void; onExpire?: () => void; duration?: number }
export interface ToastDetail extends ToastOpts { message: string }
export function toast(message: string, opts: ToastOpts = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>('lem:toast', { detail: { message, ...opts } }));
}
