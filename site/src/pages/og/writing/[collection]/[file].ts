import type { APIRoute } from 'astro';
import { index, writingIn, type Rec } from '../../../../lib/content';
import { slugOf } from '../../../../lib/urls';
import { linkCard, instagramCard } from '../../../../lib/share/card';
import { shareForPiece } from '../../../../lib/share/data';
import identity from '@theme/identity';
import type { Writing } from '@lem/vault-core';

export async function getStaticPaths() {
  const idx = await index();
  return idx.config.collections
    .filter((c) => !identity.writing.rootCollections.includes(c.key))
    .flatMap((c) => writingIn(idx, c.key).flatMap((w) => [
      { params: { collection: c.key, file: `${slugOf(w)}.png` }, props: { path: w.path, ig: false } },
      { params: { collection: c.key, file: `${slugOf(w)}-instagram.png` }, props: { path: w.path, ig: true } },
    ]));
}
export const GET: APIRoute = async ({ props }) => {
  const idx = await index();
  const s = shareForPiece(idx.byPath.get(props.path as string) as Rec<Writing>, idx);
  const buf = await (props.ig ? instagramCard(s) : linkCard(s));
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/png' } });
};
