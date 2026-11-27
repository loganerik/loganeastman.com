export function fmtPrice(price: number | string | null | undefined, currency = 'USD'): string {
  if (price === null || price === undefined || price === '') return 'Varies';
  const n = typeof price === 'number' ? price : parseFloat(String(price));
  if (!Number.isFinite(n)) return String(price);
  const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(n);
  return s.replace(/\.00$/, '');
}
export function hostOf(url: string | undefined): string {
  try {
    const h = new URL(url ?? '').hostname;
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}
