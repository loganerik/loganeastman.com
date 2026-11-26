export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'"]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** `<title>-<year>` for items; year optional. */
export function itemSlug(title: string, year?: number | null): string {
  const base = slugify(title) || 'untitled';
  return year ? `${base}-${year}` : base;
}

/** `<yyyy-mm-dd>-<slug>` for dated records. */
export function datedSlug(date: string, title: string): string {
  return `${date.slice(0, 10)}-${slugify(title) || 'untitled'}`;
}
