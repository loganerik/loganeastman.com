// Share images, drawn at build time: a link preview (1200×630) and an Instagram post (1080×1350) for a thought or a
// piece. Satori turns the layout into shapes (no fonts needed where it runs); sharp turns that into a PNG.
import satori from 'satori';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import identity from '@theme/identity';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFile(require.resolve(`${pkg}/files/${file}`));
let fonts: Promise<Array<{ name: string; data: Buffer; weight: 400 | 500; style: 'normal' | 'italic' }>> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    font('@fontsource/newsreader', 'newsreader-latin-400-normal.woff').then((data) => ({ name: 'Newsreader', data, weight: 400 as const, style: 'normal' as const })),
    font('@fontsource/newsreader', 'newsreader-latin-400-italic.woff').then((data) => ({ name: 'Newsreader', data, weight: 400 as const, style: 'italic' as const })),
    font('@fontsource/newsreader', 'newsreader-latin-500-normal.woff').then((data) => ({ name: 'Newsreader', data, weight: 500 as const, style: 'normal' as const })),
    font('@fontsource/sometype-mono', 'sometype-mono-latin-400-normal.woff').then((data) => ({ name: 'Mono', data, weight: 400 as const, style: 'normal' as const })),
  ]);
  return fonts;
}

const C = { paper: '#f4ecdf', deep: '#ebe1cf', ink: '#1a1a18', soft: '#4a4843', green: '#243d32', rule: '#bdb5a6' };

/** An image as a PNG data URI satori can draw, or null when it cannot be had (not yet published, offline). */
const imgCache = new Map<string, Promise<{ uri: string; w: number; h: number } | null>>();
export async function firstPicture(src: string | string[] | undefined, max = 900): Promise<{ uri: string; w: number; h: number } | null> {
  for (const one of Array.isArray(src) ? src : [src]) { const p = await picture(one, max); if (p) return p; }
  return null;
}
export function picture(src: string | undefined, max = 900): Promise<{ uri: string; w: number; h: number } | null> {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) imgCache.set(src, (async () => {
    try {
      let buf: Buffer;
      if (src.startsWith('file:')) buf = await readFile(fileURLToPath(src));
      else {
        const url = src.startsWith('/') ? new URL(src, identity.site.url).toString() : src;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
        buf = Buffer.from(await res.arrayBuffer());
      }
      const out = await sharp(buf).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      return { uri: `data:image/png;base64,${out.data.toString('base64')}`, w: out.info.width, h: out.info.height };
    } catch { return null; }
  })());
  return imgCache.get(src)!;
}

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: Array<El | string | null | false | undefined>): El =>
  ({ type, props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null && c !== false && c !== undefined) } });
const img = (p: { uri: string; w: number; h: number }, boxW: number, boxH: number, extra: Record<string, unknown> = {}): El => {
  const s = Math.min(boxW / p.w, boxH / p.h);
  return { type: 'img', props: { src: p.uri, width: Math.round(p.w * s), height: Math.round(p.h * s), style: extra } };
};

export interface ShareInput {
  kind: 'thought' | 'piece';
  text: string; // the thought, or the piece's title
  kicker?: string; // "Columns", "Nov 27, 2026"
  sub?: string; // a piece's summary, or an attached link's title
  subKicker?: string; // the attached link's site
  picture?: string | string[]; // /m/… or https://…; a list tries each in turn
  cutout?: boolean; // the picture is a cutout (drawn without a frame)
}

function sizeFor(text: string, big: number): number {
  const n = text.length;
  return n < 50 ? big : n < 110 ? Math.round(big * 0.8) : n < 200 ? Math.round(big * 0.64) : Math.round(big * 0.52);
}
const clamp = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

async function footer(scale = 1): Promise<El> {
  const cats = await picture(new URL('../../../theme/assets/cats-upright-photo.webp', import.meta.url).href, 200);
  return h('div', { alignItems: 'center', gap: 16 * scale },
    cats && img(cats, 60 * scale, 76 * scale),
    h('div', { fontFamily: 'Newsreader', fontWeight: 500, fontSize: 30 * scale, color: C.ink }, identity.site.name),
    h('div', { fontFamily: 'Mono', fontSize: 20 * scale, color: C.soft, marginLeft: 8 * scale }, new URL(identity.site.url).host));
}

function words(s: ShareInput, size: number): El {
  return s.kind === 'piece'
    ? h('div', { flexDirection: 'column', gap: 18 },
        s.kicker && h('div', { fontFamily: 'Mono', fontSize: 22, letterSpacing: 2, color: C.soft, textTransform: 'uppercase' }, s.kicker),
        h('div', { fontFamily: 'Newsreader', fontSize: size, lineHeight: 1.05, color: C.ink }, clamp(s.text, 120)),
        s.sub && h('div', { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: Math.round(size * 0.42), lineHeight: 1.3, color: C.soft }, clamp(s.sub, 160)))
    : h('div', { flexDirection: 'column', gap: 16, backgroundColor: C.deep, padding: '36px 40px', border: `2px solid ${C.rule}` },
        h('div', { fontFamily: 'Newsreader', fontSize: size, lineHeight: 1.22, color: C.ink }, clamp(s.text, 280)),
        (s.sub || s.kicker) && h('div', { flexDirection: 'column', gap: 4, borderTop: `1px solid ${C.rule}`, paddingTop: 14 },
          s.subKicker && h('div', { fontFamily: 'Mono', fontSize: 16, color: C.soft, textTransform: 'uppercase', letterSpacing: 1.5 }, s.subKicker),
          s.sub && h('div', { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 24, color: C.ink }, clamp(s.sub, 90)),
          s.kicker && h('div', { fontFamily: 'Mono', fontSize: 16, color: C.soft, marginTop: 4 }, s.kicker)));
}

async function png(tree: El, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as never, { width, height, fonts: await loadFonts() });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const frame = (w: number, hh: number, pad: number, ...children: El[]): El =>
  h('div', { width: w, height: hh, backgroundColor: C.paper, padding: pad, flexDirection: 'column' },
    h('div', { flex: 1, flexDirection: 'column', border: `1px solid ${C.rule}`, padding: 6 },
      h('div', { flex: 1, flexDirection: 'column', border: `3px solid ${C.ink}`, padding: pad * 0.7, justifyContent: 'space-between' }, ...children)));

/** Link preview: words on the left, the picture on the right. */
export async function linkCard(s: ShareInput): Promise<Buffer> {
  const pic = await firstPicture(s.picture);
  const body = h('div', { flex: 1, gap: 40, alignItems: 'center' },
    h('div', { flex: 1, flexDirection: 'column', justifyContent: 'center' }, words(s, sizeFor(s.text, s.kind === 'piece' ? 76 : 50))),
    pic && h('div', { width: 400, height: 400, alignItems: 'center', justifyContent: 'center' }, img(pic, 400, 400, s.cutout ? {} : { border: `2px solid ${C.rule}` })));
  return png(frame(1200, 630, 34, body, await footer(0.8)), 1200, 630);
}

/** Instagram post (4:5): the picture above, the words below. */
export async function instagramCard(s: ShareInput): Promise<Buffer> {
  const pic = await firstPicture(s.picture, 1000);
  const body = h('div', { flex: 1, flexDirection: 'column', gap: 40, justifyContent: 'center', alignItems: 'stretch' },
    pic && h('div', { justifyContent: 'center' }, img(pic, 820, s.text.length > 120 ? 460 : 620, s.cutout ? {} : { border: `2px solid ${C.rule}` })),
    words(s, sizeFor(s.text, s.kind === 'piece' ? 96 : pic ? 52 : 68)));
  return png(frame(1080, 1350, 44, body, await footer(1)), 1080, 1350);
}
