import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';

/** People or tags as chips, typed naturally (@sam, #ceramics, or plain words) with suggestions from the vault. */
export default function ChipInput({ kind, value, onChange, placeholder, suggestions }: { kind: 'people' | 'tags' | 'plain'; value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const [all, setAll] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (suggestions) { setAll(suggestions); return; }
    if (kind === 'people') api<{ people: Array<{ title: string | null; path: string }> }>('/api/index/people').then((d) => setAll(d.people.map((p) => p.title ?? p.path.split('/').pop()!))).catch(() => {});
    else if (kind === 'tags') api<{ tags: Array<{ tag: string }> }>('/api/index/tags').then((d) => setAll(d.tags.map((t) => t.tag))).catch(() => {});
  }, [kind]);
  const norm = (s: string) => s.trim().replace(/^[@#]+/, '').replace(/,+$/, '').trim();
  const add = (s: string) => { const v = norm(s); if (v && !value.includes(v)) onChange([...value, v]); setText(''); setOpen(false); };
  const q = norm(text).toLowerCase();
  const sugg = q ? all.filter((s) => s.toLowerCase().includes(q) && !value.includes(s)).slice(0, 6) : [];
  const sigil = kind === 'people' ? '@' : kind === 'tags' ? '#' : '';
  return (
    <div class="chipin" onClick={() => box.current?.focus()}>
      {value.map((v) => <span class="chip chip--small" key={v}>{v.startsWith('private/') ? '🔒 ' + v.slice(8) : sigil + v}<button type="button" class="chipin__x" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }}>×</button></span>)}
      <input ref={box} class="chipin__in" value={text} placeholder={value.length ? '' : (placeholder ?? (kind === 'people' ? '@ a person' : kind === 'tags' ? '# a tag' : 'add…'))}
        onInput={(e) => { const t = (e.target as HTMLInputElement).value; if (t.endsWith(',')) add(t); else { setText(t); setOpen(true); } }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab') { if (text.trim()) { e.preventDefault(); add(sugg[0] && e.key === 'Tab' ? sugg[0] : text); } } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); else if (e.key === 'Escape') setOpen(false); }}
        onBlur={() => setTimeout(() => { if (text.trim()) add(text); setOpen(false); }, 120)} />
      {open && sugg.length > 0 && <ul class="picker__list" role="listbox">{sugg.map((s) => <li key={s} role="option" onMouseDown={(e) => { e.preventDefault(); add(s); }}>{sigil}{s}</li>)}</ul>}
    </div>
  );
}
