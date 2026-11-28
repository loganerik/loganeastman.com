import { useRef, useState } from 'preact/hooks';

/** Letterboxd-style rating: slide or tap across the stars, halves allowed. A native range sits on top, so keys,
 *  touch drags and screen readers all work; 0 means no rating. */
export default function StarPicker({ value, max = 5, onChange }: { value?: number; max?: number; onChange: (v: number | undefined) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const before = useRef<number | undefined>(undefined); // the rating when the press began: tapping it again clears
  const shown = hover ?? value ?? 0;
  const pick = (n: number) => onChange(n > 0 ? n : undefined);
  const fromPointer = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(max, Math.ceil(((e.clientX - r.left) / r.width) * max * 2) / 2));
  };
  return (
    <span class="star-picker">
      <span class="star-picker__stars">
        {Array.from({ length: max }, (_, i) => {
          const fill = Math.max(0, Math.min(1, shown - i));
          return <span class="star-picker__star" aria-hidden="true" style={`--fill:${fill * 100}%`}>★</span>;
        })}
        <input
          class="star-picker__range" type="range" min={0} max={max} step={0.5} value={value ?? 0}
          aria-label="Rating" aria-valuetext={value ? `${String(value).replace('.5', '½')} stars` : 'No rating'}
          onPointerMove={(e) => e.pointerType === 'mouse' && setHover(fromPointer(e as unknown as PointerEvent))}
          onPointerDown={() => { before.current = value; }}
          onPointerLeave={() => setHover(null)}
          onInput={(e) => pick(Number((e.target as HTMLInputElement).value))}
          onClick={(e) => { const n = fromPointer(e as unknown as PointerEvent); pick(n === before.current ? 0 : n); setHover(null); }}
        />
      </span>
      <span class="mono muted star-picker__val">{value ? `${String(value).replace('.5', '½')} / ${max}` : 'No rating'}</span>
      {value != null && <button type="button" class="btn btn--soft btn--small" onClick={() => pick(0)}>Clear</button>}
    </span>
  );
}
