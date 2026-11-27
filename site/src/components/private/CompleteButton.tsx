// "Mark watched" (read, listened) on an item page: finishes it wherever it sits and, if asked, opens a review draft.
import { useEffect, useState } from 'preact/hooks';
import { api, getConfig, type ListTypeDef } from './api';
import Editor from './editor/Editor';
import { toast } from './ui/toast';

export default function CompleteButton({ itemId, kind, title, finished }: { itemId: string; kind: string; title: string; finished?: string }) {
  const [lt, setLt] = useState<ListTypeDef | null>(null);
  const [done, setDone] = useState(!!finished);
  const [review, setReview] = useState<{ id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getConfig().then((c) => setLt(c.listTypes.find((t) => t.completion && t.default_for.includes(kind)) ?? null)).catch(() => {}); }, [kind]);
  if (!lt?.completion) return null;
  const go = async (withReview: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ entries: Array<{ review?: { id: string } }> }>(`/api/items/${itemId}/complete`, { method: 'POST', body: JSON.stringify({ review: withReview }) });
      setDone(true);
      const rv = r.entries.find((e) => e.review)?.review;
      toast(`${lt.completion!.label ?? 'Finished'} · “${title}” lands on ${lt.completion!.list} after the next build`);
      if (rv) setReview(rv);
    } catch (e) { toast('Could not finish it: ' + (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <p class="chips owner-row owner-row--tight">
        {done ? <span class="mono muted">Finished{finished ? ` · ${finished}` : ''}</span> : (<>
          <button type="button" class="btn btn--soft" disabled={busy} onClick={() => go(false)}>{lt.completion.label ?? 'Mark done'}</button>
          <button type="button" class="btn btn--soft" disabled={busy} onClick={() => go(true)}>…and review it</button>
        </>)}
      </p>
      {review && <div class="inline-edit"><p class="mono muted">Review · {title}</p><Editor id={review.id} inline onDone={() => setReview(null)} onDeleted={() => setReview(null)} /></div>}
    </>
  );
}
