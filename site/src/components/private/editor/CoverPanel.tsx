// Cover and artwork for a record: upload a cover (kept out of the body), or pick one of the body's images;
// choose the clipping treatment for the wall; ask for a cutout; approve photos.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';

type Art = Record<string, unknown> & { treatment?: string; thumb?: string; thumb_size?: [number, number]; full?: string; full_size?: [number, number]; clip?: string; media?: string; alt?: string };
interface Variant { url: string; w: number; h: number }
interface Attachment { media: string; alt?: string; variants: Partial<Record<'thumb' | 'full' | 'clip', Variant>> }

export default function CoverPanel({ recordId, type, kind, body, cover, artwork, approved, onChange, onStatus }: {
  recordId: string; type: string; kind?: string; body: string; cover: string | undefined; artwork: Art | null; approved?: boolean;
  onChange: (next: { cover?: string; artwork: Art | null; approved?: boolean }) => void; onStatus: (s: string) => void;
}) {
  const [index, setIndex] = useState<Record<string, Attachment>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ attachments: Record<string, Attachment> }>('/api/media/index').then((d) => setIndex(d.attachments ?? {})).catch(() => {}); }, [recordId]);

  const bodyTargets = [...body.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i);
  const find = (t: string) => { const key = Object.keys(index).find((k) => k === t || k.endsWith('/' + t.split('/').pop()!)); return key ? { key, att: index[key]! } : null; };
  const candidates = bodyTargets.map((t) => ({ target: t, ...(find(t) ?? {}) }));
  if (cover && !bodyTargets.some((t) => find(t)?.key === cover)) { const f = find(cover); candidates.unshift({ target: cover, ...(f ?? {}) }); }

  const apply = (key: string, att: Attachment | undefined, treatment = artwork?.treatment ?? 'paper') => {
    const v = att?.variants ?? {};
    onChange({ cover: key, artwork: { ...(artwork ?? {}), treatment, media: att?.media ?? artwork?.media, thumb: v.thumb?.url, thumb_size: v.thumb ? [v.thumb.w, v.thumb.h] : undefined, full: v.full?.url, full_size: v.full ? [v.full.w, v.full.h] : undefined, clip: v.clip?.url, clip_size: v.clip ? [v.clip.w, v.clip.h] : undefined } });
  };

  const upload = async (file: File, asCover: boolean) => {
    setBusy(true); onStatus('Uploading…');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('record_id', recordId);
      const r = await fetch('/api/assets', { method: 'POST', body: fd, credentials: 'include' });
      const j = (await r.json()) as { path: string; media_id: string; thumb: Variant; full: Variant; error?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      const att: Attachment = { media: j.media_id, variants: { thumb: j.thumb, full: j.full } };
      setIndex((x) => ({ ...x, [j.path]: att }));
      if (asCover) apply(j.path, att);
      onStatus(asCover ? 'Cover uploaded · save to keep it' : 'Image uploaded');
    } catch (e) { onStatus(`Upload failed: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const cutout = async () => {
    const media = artwork?.media;
    if (!media) { onStatus('Pick or upload a cover first'); return; }
    onChange({ cover, artwork: { ...(artwork ?? {}), treatment: 'cutout' } });
    await api(`/api/media/${media}/variants/clip/regenerate`, { method: 'POST', body: JSON.stringify({ provider: 'local' }) }).catch(() => api(`/api/media/${media}/variants/clip/regenerate`, { method: 'POST', body: JSON.stringify({}) }));
    onStatus('Cutout requested · it appears after the next sync and build');
  };

  const treatments = type === 'item' && (kind === 'film' || kind === 'tv') ? ['poster', 'lettering', 'typeset'] : type === 'item' && (kind === 'book' || kind === 'album') ? ['cover', 'typeset'] : ['paper', 'cutout', 'cover', 'typeset'];
  const canCut = treatments.includes('cutout');
  const isCut = artwork?.treatment === 'cutout' || (!artwork?.treatment && canCut && !!artwork?.clip);
  const toggleCut = (on: boolean) => {
    if (on) { if (artwork?.clip) onChange({ cover, artwork: { ...(artwork ?? {}), treatment: 'cutout' } }); else void cutout(); }
    else onChange({ cover, artwork: { ...(artwork ?? {}), treatment: 'paper' } });
  };
  const current = artwork?.clip ?? artwork?.thumb ?? artwork?.full;
  return (
    <div class="cover">
      {current && (
        <div class="cover__now">
          <img class="cover__current" src={current} alt="" />
          {canCut && <label class="mono cover__treat"><input type="checkbox" checked={isCut} disabled={busy} onChange={(e) => toggleCut((e.target as HTMLInputElement).checked)} /> Cut out the subject</label>}
        </div>
      )}
      <div class="cover__row">
        <label class="btn btn--soft"><input type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) upload(f, true); }} />{cover ? 'Replace cover' : 'Upload a cover'}</label>
        <label class="mono cover__treat">Treatment <select value={String(artwork?.treatment ?? treatments[0])} onChange={(e) => onChange({ cover, artwork: { ...(artwork ?? {}), treatment: (e.target as HTMLSelectElement).value } })}>{treatments.map((t) => <option value={t}>{t}</option>)}</select></label>
        {isCut && artwork?.media && <button type="button" class="btn" onClick={cutout} disabled={busy}>Redo cutout</button>}
        {cover && <button type="button" class="btn" onClick={() => onChange({ cover: undefined, artwork: null })}>No cover</button>}
        {type === 'item' && kind === 'photo' && <label class="mono cover__treat"><input type="checkbox" checked={!!approved} onChange={(e) => onChange({ cover, artwork, approved: (e.target as HTMLInputElement).checked })} /> Approved for public use</label>}
      </div>
      {candidates.length > 0 && (
        <ul class="cover__grid">
          {candidates.map((c) => {
            const src = c.att?.variants.clip?.url ?? c.att?.variants.thumb?.url;
            const on = !!cover && c.key === cover;
            return (
              <li class={`cover__cand ${on ? 'cover__cand--on' : ''}`} key={c.target}>
                <button type="button" onClick={() => c.key && apply(c.key, c.att)} title={c.target} disabled={!c.key}>
                  {src ? <img src={src} alt="" loading="lazy" /> : <span class="mono muted">{c.target.split('/').pop()}</span>}
                </button>
                <span class="mono muted cover__name">{on ? 'Cover · ' : ''}{c.target.split('/').pop()}</span>
              </li>
            );
          })}
        </ul>
      )}
      {artwork?.clip && <p class="mono muted">Cutout ready: <img class="cover__clip" src={String(artwork.clip)} alt="" width={80} /></p>}
      <p class="mono muted cover__hint">Body images come from Add photos or pasting into the text. A cover can be one of them or its own picture; only the cover goes to the wall and lists.</p>
    </div>
  );
}
