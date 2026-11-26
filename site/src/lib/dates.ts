import identity from '@theme/identity';

const tz = 'America/Los_Angeles';
export function fmtDate(d: string | Date | undefined, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d.length <= 10 ? d + 'T12:00:00' : d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return new Intl.DateTimeFormat(identity.site.locale, { timeZone: tz, ...opts }).format(date);
}
export function fmtMonth(d: string): string {
  return fmtDate(d, { year: 'numeric', month: 'long' });
}
export function isoDay(d: string | Date | undefined): string {
  if (!d) return '';
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
}
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
