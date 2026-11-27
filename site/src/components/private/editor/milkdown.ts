// Milkdown (ProseMirror) editor with Obsidian syntax preserved: [[wikilinks]], ![[embeds]], ==highlights==,
// and `> [!type]` callout headers survive a round trip because they become their own nodes with raw serializers.
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx, editorViewOptionsCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, wrapInHeadingCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInOrderedListCommand, insertHrCommand, toggleInlineCodeCommand, toggleLinkCommand, turnIntoTextCommand } from '@milkdown/kit/preset/commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { history } from '@milkdown/kit/plugin/history';
import { $node, $mark, $remark, $inputRule, callCommand, getMarkdown } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import type { Node as MdNode, Parent } from 'mdast';

// ---------- remark: text → custom mdast nodes ----------
const WIKI = /(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const HIGHLIGHT = /==([^=\n]+)==/g;
const CALLOUT = /^\[!([\w-]+)\]([-+]?)[ \t]*/;

function visitText(tree: MdNode, fn: (node: { type: 'text'; value: string }, parent: Parent, index: number) => MdNode[] | void) {
  const walk = (n: MdNode) => {
    const p = n as Parent;
    if (!p.children) return;
    for (let i = 0; i < p.children.length; i++) {
      const c = p.children[i]!;
      if (c.type === 'text' && (p as { type: string }).type !== 'link') {
        const out = fn(c as { type: 'text'; value: string }, p, i);
        if (out) { p.children.splice(i, 1, ...(out as never[])); i += out.length - 1; }
      } else walk(c);
    }
  };
  walk(tree);
}

const obsidianRemark = $remark('obsidian-remark', () => () => (tree: MdNode) => {
  // callout header: first text of the first paragraph in a blockquote
  const walkBq = (n: MdNode) => {
    const p = n as Parent;
    if (!p.children) return;
    for (const c of p.children) {
      if (c.type === 'blockquote') {
        const para = (c as Parent).children[0] as Parent | undefined;
        const t = para?.children?.[0] as { type: string; value: string } | undefined;
        if (para?.type === 'paragraph' && t?.type === 'text') {
          const m = CALLOUT.exec(t.value);
          if (m) {
            t.value = t.value.slice(m[0].length);
            const marker = { type: 'calloutMarker', kind: m[1], fold: m[2] ?? '' } as unknown as MdNode;
            if (t.value) para.children.unshift(marker); else para.children.splice(0, 1, marker);
          }
        }
      }
      walkBq(c);
    }
  };
  walkBq(tree);
  visitText(tree, (node) => {
    const v = node.value;
    if (!/\[\[|==/.test(v)) return;
    const out: MdNode[] = [];
    let last = 0;
    const re = new RegExp(`${WIKI.source}|${HIGHLIGHT.source}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(v))) {
      if (m.index > last) out.push({ type: 'text', value: v.slice(last, m.index) } as MdNode);
      if (m[2] !== undefined) out.push({ type: m[1] === '!' ? 'embed' : 'wikilink', target: m[2].trim(), anchor: m[3]?.trim() ?? '', label: m[4]?.trim() ?? '' } as unknown as MdNode);
      else out.push({ type: 'highlight', children: [{ type: 'text', value: m[5] }] } as unknown as MdNode);
      last = m.index + m[0].length;
    }
    if (!out.length) return;
    if (last < v.length) out.push({ type: 'text', value: v.slice(last) } as MdNode);
    return out;
  });
});

// ---------- ProseMirror nodes / marks ----------
export const wikilinkNode = $node('wikilink', () => ({
  inline: true, group: 'inline', atom: true, selectable: true, draggable: false,
  attrs: { target: { default: '' }, anchor: { default: '' }, label: { default: '' } },
  parseDOM: [{ tag: 'span[data-wikilink]', getAttrs: (dom) => ({ target: (dom as HTMLElement).dataset.wikilink ?? '', anchor: (dom as HTMLElement).dataset.anchor ?? '', label: (dom as HTMLElement).dataset.label ?? '' }) }],
  toDOM: (node) => ['span', { class: 'wl wl--editor', 'data-wikilink': node.attrs.target, 'data-anchor': node.attrs.anchor, 'data-label': node.attrs.label, contenteditable: 'false' }, node.attrs.label || (node.attrs.target.split('/').pop() + (node.attrs.anchor ? ' › ' + node.attrs.anchor : ''))],
  parseMarkdown: { match: (n) => n.type === 'wikilink', runner: (state, n, type) => { state.addNode(type, { target: n.target, anchor: n.anchor, label: n.label }); } },
  toMarkdown: { match: (n) => n.type.name === 'wikilink', runner: (state, n) => { state.addNode('wikilink', undefined, undefined, { target: n.attrs.target, anchor: n.attrs.anchor, label: n.attrs.label }); } },
}));

export const embedNode = $node('embed', () => ({
  inline: true, group: 'inline', atom: true, selectable: true, draggable: true,
  attrs: { target: { default: '' }, label: { default: '' }, src: { default: '' } },
  parseDOM: [{ tag: 'span[data-embed]', getAttrs: (dom) => ({ target: (dom as HTMLElement).dataset.embed ?? '', label: (dom as HTMLElement).dataset.label ?? '', src: (dom as HTMLElement).dataset.src ?? '' }) }],
  toDOM: (node) => {
    const isImg = /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(node.attrs.target);
    return ['span', { class: `embed-node ${isImg ? 'embed-node--img' : ''}`, 'data-embed': node.attrs.target, 'data-label': node.attrs.label, 'data-src': node.attrs.src, contenteditable: 'false' },
      ...(node.attrs.src ? [['img', { src: node.attrs.src, alt: node.attrs.label, loading: 'lazy' }]] : []),
      ['span', { class: 'embed-node__name mono' }, `${isImg ? '🖼 ' : '⧉ '}${node.attrs.target.split('/').pop()}${node.attrs.label ? ' · ' + node.attrs.label : ''}`]];
  },
  parseMarkdown: { match: (n) => n.type === 'embed', runner: (state, n, type) => { state.addNode(type, { target: n.target, label: n.label }); } },
  toMarkdown: { match: (n) => n.type.name === 'embed', runner: (state, n) => { state.addNode('embed', undefined, undefined, { target: n.attrs.target, label: n.attrs.label }); } },
}));

export const calloutMarkerNode = $node('calloutMarker', () => ({
  inline: true, group: 'inline', atom: true, selectable: true,
  attrs: { kind: { default: 'note' }, fold: { default: '' } },
  parseDOM: [{ tag: 'span[data-callout]', getAttrs: (dom) => ({ kind: (dom as HTMLElement).dataset.callout ?? 'note', fold: (dom as HTMLElement).dataset.fold ?? '' }) }],
  toDOM: (node) => ['span', { class: 'callout-marker mono', 'data-callout': node.attrs.kind, 'data-fold': node.attrs.fold, contenteditable: 'false' }, `[!${node.attrs.kind}]${node.attrs.fold} `],
  parseMarkdown: { match: (n) => n.type === 'calloutMarker', runner: (state, n, type) => { state.addNode(type, { kind: n.kind, fold: n.fold }); } },
  toMarkdown: { match: (n) => n.type.name === 'calloutMarker', runner: (state, n) => { state.addNode('calloutMarker', undefined, undefined, { kind: n.attrs.kind, fold: n.attrs.fold }); } },
}));

export const highlightMark = $mark('highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', { class: 'hl' }],
  parseMarkdown: { match: (n) => n.type === 'highlight', runner: (state, n, type) => { state.openMark(type); state.next(n.children); state.closeMark(type); } },
  toMarkdown: { match: (m) => m.type.name === 'highlight', runner: (state, m) => { state.withMark(m, 'highlight'); } },
}));

const highlightInputRule = $inputRule((ctx) => new InputRule(/==([^=]+)==$/, (state, match, start, end) => {
  const mark = highlightMark.type(ctx);
  const tr = state.tr.insertText(match[1]!, start, end);
  return tr.addMark(start, start + match[1]!.length, mark.create()).removeStoredMark(mark);
}));
const wikilinkInputRule = $inputRule((ctx) => new InputRule(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/, (state, match, start, end) =>
  state.tr.replaceWith(start, end, wikilinkNode.type(ctx).create({ target: match[1]!.trim(), anchor: match[2]?.trim() ?? '', label: match[3]?.trim() ?? '' }))));

// remark-stringify handlers: custom mdast nodes go out verbatim
const handlers = {
  wikilink: (n: { target: string; anchor: string; label: string }) => `[[${n.target}${n.anchor ? '#' + n.anchor : ''}${n.label ? '|' + n.label : ''}]]`,
  embed: (n: { target: string; label: string }) => `![[${n.target}${n.label ? '|' + n.label : ''}]]`,
  calloutMarker: (n: { kind: string; fold: string }) => `[!${n.kind}]${n.fold} `,
  highlight: (n: Parent, _: unknown, state: { containerPhrasing: (n: Parent, i: unknown) => string }, info: unknown) => `==${state.containerPhrasing(n, info)}==`,
};

export const obsidianPlugins = [obsidianRemark, wikilinkNode, embedNode, calloutMarkerNode, highlightMark, highlightInputRule, wikilinkInputRule].flat();

export interface RichEditor { editor: Editor; getMarkdown: () => string; destroy: () => void; cmd: (name: string, payload?: unknown) => void; insertEmbed: (target: string, label?: string, src?: string) => void }

export async function createRichEditor(root: HTMLElement, markdown: string, onChange: (md: string) => void): Promise<RichEditor> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.update(editorViewOptionsCtx, (o) => ({ ...o, attributes: { class: 'prose rich', spellcheck: 'true' } }));
      ctx.update(remarkStringifyOptionsCtx, (o) => ({ ...o, bullet: '-', emphasis: '*', strong: '*', fences: true, rule: '-', listItemIndent: 'one', incrementListMarker: false, handlers: { ...(o as { handlers?: object }).handlers, ...handlers } }));
      ctx.get(listenerCtx).markdownUpdated((_, md, prev) => { if (md !== prev) onChange(md); });
    })
    .use(commonmark).use(gfm).use(listener).use(history).use(obsidianPlugins)
    .create();
  const commands: Record<string, unknown> = {
    bold: toggleStrongCommand.key, italic: toggleEmphasisCommand.key, strike: toggleStrikethroughCommand.key, code: toggleInlineCodeCommand.key,
    h2: wrapInHeadingCommand.key, h3: wrapInHeadingCommand.key, quote: wrapInBlockquoteCommand.key, ul: wrapInBulletListCommand.key, ol: wrapInOrderedListCommand.key, hr: insertHrCommand.key, link: toggleLinkCommand.key, text: turnIntoTextCommand.key,
  };
  return {
    editor,
    getMarkdown: () => editor.action(getMarkdown()),
    destroy: () => { editor.destroy(); },
    cmd: (name, payload) => { const key = commands[name]; if (!key) return; editor.action(callCommand(key as never, (name === 'h2' ? 2 : name === 'h3' ? 3 : payload) as never)); },
    insertEmbed: (target, label = '', src = '') => editor.action((ctx) => { const view = ctx.get(editorViewCtx); const node = embedNode.type(ctx).create({ target, label, src }); view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView()); view.focus(); }),
  };
}

/** Constructs the rich editor cannot round-trip faithfully; such notes open in Markdown mode. */
export function isLossy(md: string): string | null {
  if (/%%/.test(md)) return 'Obsidian comments (%%)';
  if (/\^[a-z0-9-]+\s*$/m.test(md)) return 'block ids (^id)';
  if (/^\s*[\w-]+::\s/m.test(md)) return 'dataview fields (key::)';
  if (/<(div|table|details|iframe|figure)\b/i.test(md)) return 'raw HTML blocks';
  if (/^>\s*>/m.test(md)) return 'nested blockquotes';
  if (/\$\$|\$[^$\n]+\$/.test(md)) return 'math';
  if (/(^|[\s(])@[A-Za-z]/.test(md)) return '@mentions';
  return null;
}
