// Letterboxd-style ratings: filled stars only, in halves, with an optional heart for "liked".
export function clampRating(r: number, scale = 5): number {
  return Math.max(0, Math.min(scale, Math.round(r * 2) / 2));
}
export function starText(r: number | null | undefined, scale = 5): string {
  if (r == null || Number.isNaN(Number(r))) return '';
  const v = clampRating(Number(r), scale);
  return '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');
}
export function starLabel(r: number | null | undefined, scale = 5, liked = false): string {
  const parts: string[] = [];
  if (r != null) { const v = clampRating(Number(r), scale); parts.push(`${String(v).replace('.5', '½')} out of ${scale} stars`); }
  if (liked) parts.push('liked');
  return parts.join(', ');
}
