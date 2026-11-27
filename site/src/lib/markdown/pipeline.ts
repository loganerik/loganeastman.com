// One unified pipeline shared by the build and (later) the editor preview.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { toString as mdToString } from 'mdast-util-to-string';
import { toString as hastToString } from 'hast-util-to-string';
import type { Root as MdRoot, Text, PhrasingContent, Blockquote, Paragraph } from 'mdast';
import type { Root as HastRoot, Element } from 'hast';

export interface EmbedImage { kind: 'image'; src: string; width?: number; height?: number; alt?: string; srcset?: string }
export interface EmbedNote { kind: 'note'; html: string; title: string; url: string | null }
export interface RenderContext {
  /** Public target → {url,title}; private or missing → null (rendered as plain text). */
  resolveLink(target: string): { url: string; title: string } | null;
  resolveEmbed(target: string, size?: string): EmbedImage | EmbedNote | null;
  tagUrl(tag: string): string | null;
  /** `@Name` → how to show it per the site's mention policy: a link for public people, bare text otherwise. */
  resolveMention?(name: string): { url?: string; text: string } | null;
}

export interface Rendered {
  html: string;
  headings: Array<{ depth: number; slug: string; text: string }>;
  excerpt: string;
  text: string;
  wordCount: number;
}

const WIKI_RE = /(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const TAG_RE = /(^|[\s(])#([A-Za-z][\w/-]*)/g;
const MENTION_RE = /(^|[\s(])@([A-Za-z][\w'-]*)/g;

function remarkObsidian(ctx: RenderContext) {
  return (tree: MdRoot) => {
    // 1. callouts: > [!type]- Title
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (!first || first.type !== 'paragraph') return;
      const t = first.children[0];
      if (!t || t.type !== 'text') return;
      const m = /^\[!([\w-]+)\]([-+]?)[ \t]*([^\n]*)\n?/.exec(t.value);
      if (!m) return;
      const type = m[1]!.toLowerCase();
      const title = m[3]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
      t.value = t.value.slice(m[0].length);
      if (!t.value) first.children.shift();
      if (first.children.length === 0) node.children.shift();
      const titleNode: Paragraph = {
        type: 'paragraph',
        data: { hName: 'p', hProperties: { className: ['callout__title'] } },
        children: [{ type: 'text', value: title }],
      };
      node.children.unshift(titleNode);
      node.data = { hName: 'aside', hProperties: { className: ['callout'], 'data-type': type, 'data-fold': m[2] || undefined } };
    });

    // 2. wikilinks, embeds, highlights, inline tags inside text nodes
    visit(tree, 'text', (node: Text, idx, parent) => {
      if (!parent || idx === undefined) return;
      if (parent.type === 'link' || parent.type === 'linkReference') return;
      const value = node.value;
      if (!/\[\[|==|#|@/.test(value)) return;
      const out: PhrasingContent[] = [];
      let last = 0;
      const re = new RegExp(`${WIKI_RE.source}|==([^=\\n]+)==|${TAG_RE.source}|${MENTION_RE.source}`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
        if (m[2] !== undefined) {
          const embed = m[1] === '!';
          const target = m[2].trim();
          const anchor = m[3]?.trim();
          const label = m[4]?.trim();
          if (embed) {
            const e = ctx.resolveEmbed(target, label);
            if (e?.kind === 'image') {
              out.push({
                type: 'image',
                url: e.src,
                alt: e.alt ?? (label && !/^\d+$/.test(label) ? label : ''),
                data: { hProperties: { width: e.width, height: e.height, srcset: e.srcset, loading: 'lazy', decoding: 'async' } },
              });
            } else if (e?.kind === 'note') {
              out.push({ type: 'html', value: `<aside class="embed"${e.url ? ` data-from="${e.url}"` : ''}><p class="embed__from">${escapeHtml(e.title)}</p>${e.html}</aside>` } as never);
            }
            // private/missing embeds render nothing
          } else {
            const r = ctx.resolveLink(target);
            const text = label ?? (anchor ? `${target.split('/').pop()} › ${anchor}` : r?.title ?? target.split('/').pop()!);
            if (r) out.push({ type: 'link', url: r.url + (anchor ? '#' + slugAnchor(anchor) : ''), data: { hProperties: { className: ['wl'] } }, children: [{ type: 'text', value: text }] });
            else out.push({ type: 'text', value: text, data: { hName: 'span', hProperties: { className: ['wl', 'wl--dead'] } } } as never);
          }
        } else if (m[5] !== undefined) {
          out.push({ type: 'text', value: m[5], data: { hName: 'mark' } } as never);
        } else if (m[7] !== undefined) {
          if (m[6]) out.push({ type: 'text', value: m[6] });
          const url = ctx.tagUrl(m[7]);
          if (url) out.push({ type: 'link', url, data: { hProperties: { className: ['tag'] } }, children: [{ type: 'text', value: '#' + m[7] }] });
          else out.push({ type: 'text', value: '#' + m[7] });
        } else if (m[9] !== undefined) {
          if (m[8]) out.push({ type: 'text', value: m[8] });
          const who = ctx.resolveMention?.(m[9]) ?? { text: m[9] };
          if (who.url) out.push({ type: 'link', url: who.url, data: { hProperties: { className: ['mention'] } }, children: [{ type: 'text', value: who.text }] });
          else out.push({ type: 'text', value: who.text });
        }
        last = m.index + m[0].length;
      }
      if (out.length === 0) return;
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
      parent.children.splice(idx, 1, ...out);
      return idx + out.length;
    });
  };
}

function rehypeFigures() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, idx, parent) => {
      if (node.tagName !== 'p' || !parent || idx === undefined) return;
      const imgs = node.children.filter((c) => c.type === 'element' && c.tagName === 'img') as Element[];
      const others = node.children.filter((c) => !(c.type === 'element' && c.tagName === 'img') && !(c.type === 'text' && !c.value.trim()));
      if (imgs.length === 1 && others.length === 0) {
        const img = imgs[0]!;
        const alt = String(img.properties?.alt ?? '');
        const fig: Element = {
          type: 'element',
          tagName: 'figure',
          properties: { className: ['figure'] },
          children: alt ? [img, { type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: alt }] }] : [img],
        };
        (parent.children as Element[])[idx] = fig;
      }
    });
  };
}

function slugAnchor(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export async function renderMarkdown(body: string, ctx: RenderContext): Promise<Rendered> {
  const src = body.replace(/%%[\s\S]*?%%/g, ''); // Obsidian comments never render
  const headings: Rendered['headings'] = [];
  let excerpt = '';
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkObsidian, ctx)
    .use(() => (tree: MdRoot) => {
      const p = tree.children.find((n) => n.type === 'paragraph');
      excerpt = p ? mdToString(p) : '';
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeExternalLinks, { rel: ['noopener'], target: '_blank', test: (n: Element) => /^https?:\/\//.test(String(n.properties?.href ?? '')) })
    .use(rehypeFigures)
    .use(() => (tree: HastRoot) => {
      visit(tree, 'element', (n: Element) => {
        if (/^h[2-4]$/.test(n.tagName)) headings.push({ depth: Number(n.tagName[1]), slug: String(n.properties?.id ?? ''), text: hastToString(n) });
      });
    })
    .use(rehypeStringify);
  const file = await processor.process(src);
  const text = src.replace(/[#>*_`\[\]!]/g, '').replace(/\s+/g, ' ').trim();
  return { html: String(file), headings, excerpt, text, wordCount: text ? text.split(' ').length : 0 };
}
