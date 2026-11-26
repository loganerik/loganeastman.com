import { renderMarkdown, type Rendered, type RenderContext } from './markdown/pipeline';
import { getIndex, type VaultIndex, type VaultRecord } from '../loaders/index';
import { urlFor, titleOf, tagUrl } from './urls';
import { isPrivateTag } from '@lem/vault-core';

const cache = new WeakMap<VaultRecord, Promise<Rendered>>();

export function contextFor(index: VaultIndex, depth = 0): RenderContext {
  return {
    resolveLink(target) {
      const r = index.resolve(target);
      if (!r) return null;
      if (!r.public) {
        // private people render as plain text (mention_policy text) or alias
        if (r.type === 'person' && index.config.site.mention_policy === 'alias' && (r.data as { public_alias?: string }).public_alias)
          return null;
        return null;
      }
      return { url: urlFor(r, index), title: titleOf(r) };
    },
    resolveEmbed(target, size) {
      const t = target.replace(/^\.?\//, '');
      // attachments: match by full path or by basename
      const att = index.media.attachments[t] ?? index.media.attachments[`attachments/orig/${t}`] ??
        Object.entries(index.media.attachments).find(([k]) => k.endsWith('/' + t.split('/').pop()!))?.[1];
      if (att) {
        const v = att.variants.full ?? att.variants.thumb;
        if (!v) return null;
        const width = size && /^\d+$/.test(size) ? Number(size) : v.w;
        const srcset = att.variants.thumb && att.variants.full ? `${att.variants.thumb.url} ${att.variants.thumb.w}w, ${att.variants.full.url} ${att.variants.full.w}w` : undefined;
        return { kind: 'image', src: v.url, width, height: Math.round((v.h / v.w) * width), alt: att.alt, srcset };
      }
      if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(t)) return null; // no public derivative yet
      const r = index.resolve(t);
      if (!r || !r.public || depth > 0) return null;
      return { kind: 'note', html: '', title: titleOf(r), url: urlFor(r, index) }; // filled lazily below
    },
    tagUrl(tag) {
      if (isPrivateTag(tag)) return null;
      const rec = index.resolve(`tags/${tag}`);
      if (rec && !rec.public) return null;
      return tagUrl(tag);
    },
  };
}

export async function renderRecord(r: VaultRecord, index?: VaultIndex): Promise<Rendered> {
  const idx = index ?? (await getIndex());
  let p = cache.get(r);
  if (!p) {
    const ctx = contextFor(idx);
    const base = ctx.resolveEmbed;
    // transclusions: render the target note once (depth 1)
    ctx.resolveEmbed = (target, size) => {
      const e = base(target, size);
      if (e?.kind === 'note') {
        const t = idx.resolve(target)!;
        const inner = renderMarkdownSync(t, idx);
        return { ...e, html: inner };
      }
      return e;
    };
    p = renderMarkdown(r.body, ctx);
    cache.set(r, p);
  }
  return p;
}

// Transclusion needs synchronous HTML inside a remark visitor; pre-render targets with a plain context.
const innerCache = new WeakMap<VaultRecord, string>();
function renderMarkdownSync(r: VaultRecord, idx: VaultIndex): string {
  const hit = innerCache.get(r);
  if (hit !== undefined) return hit;
  innerCache.set(r, '');
  void renderMarkdown(r.body, contextFor(idx, 1)).then((x) => innerCache.set(r, x.html));
  return '';
}

/** Pre-warm transclusion targets so the sync lookup above has HTML. Call before rendering pages that may embed. */
export async function prewarm(index: VaultIndex): Promise<void> {
  await Promise.all(index.records.filter((r) => r.public).map(async (r) => innerCache.set(r, (await renderMarkdown(r.body, contextFor(index, 1))).html)));
}
