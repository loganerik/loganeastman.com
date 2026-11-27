import type { Field } from './fields';
import { peopleFromRelated, relatedWithPeople } from './fields';
import RecordPicker from '../ui/RecordPicker';
import ChipInput from '../ui/ChipInput';

function toLocalInput(v: unknown): string {
  if (!v) return '';
  const str = String(v);
  const d = new Date(str.length <= 10 ? str + 'T12:00:00' : str);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const wl = (v: unknown) => String(v ?? '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');

/** One field of a record's frontmatter, rendered the calm way. */
export default function FieldRow({ f, fm, onChange }: { f: Field; fm: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const v = fm[f.key];
  const upd = (val: unknown) => onChange(f.key, val === '' ? undefined : val);
  const lab = <span class="field__label">{f.label}</span>;
  switch (f.kind) {
    case 'bool': return <label class="field field--row" key={f.key}><input type="checkbox" checked={!!v} onChange={(e) => upd((e.target as HTMLInputElement).checked)} />{lab}</label>;
    case 'visibility': return (
      <div class="field" key={f.key}>{lab}
        <span class="seg" role="radiogroup" aria-label={f.label}>
          <button type="button" class="seg__b" aria-pressed={v !== 'private'} onClick={() => upd('public')}>Public</button>
          <button type="button" class="seg__b" aria-pressed={v === 'private'} onClick={() => upd('private')}>Private</button>
        </span>
      </div>
    );
    case 'select': return <label class="field" key={f.key}>{lab}<select value={String(v ?? '')} onChange={(e) => upd((e.target as HTMLSelectElement).value)}>{f.options!.map((o) => <option value={o.value}>{o.label}</option>)}</select></label>;
    case 'tags': return <div class="field" key={f.key}>{lab}<ChipInput kind="tags" value={Array.isArray(v) ? (v as string[]) : []} onChange={(t) => upd(t)} placeholder={f.placeholder} />{f.hint && <span class="field__hint mono muted">{f.hint}</span>}</div>;
    case 'people': return <div class="field" key={f.key}>{lab}<ChipInput kind="people" value={peopleFromRelated(v)} onChange={(p) => onChange('related', relatedWithPeople(v, p))} />{f.hint && <span class="field__hint mono muted">{f.hint}</span>}</div>;
    case 'record': return <div class="field" key={f.key}>{lab}<RecordPicker type={f.recordType ?? 'item'} kinds={f.recordKinds} value={wl(v)} label={wl(v).split('/').pop()?.replace(/-/g, ' ') ?? ''} placeholder={f.placeholder} onChange={(p) => upd(p ? `[[${p.path}]]` : undefined)} />{f.hint && <span class="field__hint mono muted">{f.hint}</span>}</div>;
    case 'number': return <label class="field" key={f.key}>{lab}<input type="number" step="any" value={v == null ? '' : String(v)} onInput={(e) => upd((e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value))} /></label>;
    case 'date': return <label class="field" key={f.key}>{lab}<input type="date" value={String(v ?? '').slice(0, 10)} onInput={(e) => upd((e.target as HTMLInputElement).value)} /></label>;
    case 'datetime': return <label class="field" key={f.key}>{lab}<input type="datetime-local" value={toLocalInput(v)} onInput={(e) => { const x = (e.target as HTMLInputElement).value; upd(x ? new Date(x).toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined); }} /></label>;
    case 'long': return <label class="field" key={f.key}>{lab}<textarea rows={2} value={String(v ?? '')} placeholder={f.placeholder} onInput={(e) => upd((e.target as HTMLTextAreaElement).value)} /></label>;
    case 'slug': return <label class="field" key={f.key}>{lab}<input value={String(v ?? '')} placeholder={f.placeholder} onInput={(e) => upd((e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} /></label>;
    default: return <label class="field" key={f.key}>{lab}<input value={String(v ?? '')} placeholder={f.placeholder} onInput={(e) => upd((e.target as HTMLInputElement).value)} /></label>;
  }
}
