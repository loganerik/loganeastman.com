// A sheet-style confirm that returns a promise. Mount <ConfirmHost/> once (OwnerShell).
export interface ConfirmOpts { title: string; text?: string; ok?: string; cancel?: string; danger?: boolean }
export function confirmSheet(opts: ConfirmOpts): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('lem:confirm', { detail: { ...opts, resolve } }));
  });
}
