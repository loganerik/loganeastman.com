import { useEffect, useState } from 'preact/hooks';
import { useConfigFile } from './useConfigFile';
import ChipInput from '../ui/ChipInput';

export default function SiteForm({ onSaved }: { onSaved?: () => void }) {
  const { file, err, busy, save } = useConfigFile('site');
  const [d, setD] = useState<Record<string, unknown>>({});
  useEffect(() => { if (file) setD({ ...file.frontmatter }); }, [file]);
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v === '' ? undefined : v }));
  if (!file) return <p class="muted">{err || 'Loading…'}</p>;
  const policy = String(d.mention_policy ?? 'text');
  return (
    <form class="cfg" onSubmit={async (e) => { e.preventDefault(); const { type, ...rest } = d; void type; if (await save(rest)) onSaved?.(); }}>
      <div class="fields fields--2">
        <label class="field"><span class="field__label">Site title</span><input value={String(d.title ?? '')} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span class="field__label">Address</span><input value={String(d.url ?? '')} onInput={(e) => set('url', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span class="field__label">Time zone</span><input value={String(d.timezone ?? '')} placeholder="America/Los_Angeles" onInput={(e) => set('timezone', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span class="field__label">Rating scale</span><input type="number" min={1} max={10} value={String(d.rating_scale ?? 5)} onInput={(e) => set('rating_scale', Number((e.target as HTMLInputElement).value))} /></label>
        <div class="field"><span class="field__label">When a private person is mentioned in public text</span>
          <span class="seg" role="radiogroup">
            <button type="button" class="seg__b" aria-pressed={policy === 'text'} onClick={() => set('mention_policy', 'text')}>Show the name</button>
            <button type="button" class="seg__b" aria-pressed={policy === 'alias'} onClick={() => set('mention_policy', 'alias')}>Use their alias</button>
            <button type="button" class="seg__b" aria-pressed={policy === 'redact'} onClick={() => set('mention_policy', 'redact')}>Say "someone"</button>
          </span>
        </div>
        <div class="field"><span class="field__label">Shop categories, in order</span><ChipInput kind="plain" value={(d.categories as string[]) ?? []} onChange={(v) => set('categories', v)} placeholder="Apparel, Books…" /></div>
      </div>
      <div class="sheet__row"><span class="mono muted sheet__status">{err}</span><button class="btn btn--solid" disabled={busy}>Save</button></div>
    </form>
  );
}
