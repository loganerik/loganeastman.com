import type { APIRoute } from 'astro';
import { index, feedPosts, type Rec } from '../../../lib/content';
import { slugOf } from '../../../lib/urls';
import { linkCard, instagramCard } from '../../../lib/share/card';
import { shareForFeed } from '../../../lib/share/data';
import type { Feed } from '@lem/vault-core';

export async function getStaticPaths() {
  const idx = await index();
  return feedPosts(idx).flatMap((p) => [
    { params: { file: `${slugOf(p)}.png` }, props: { path: p.path, ig: false } },
    { params: { file: `${slugOf(p)}-instagram.png` }, props: { path: p.path, ig: true } },
  ]);
}
export const GET: APIRoute = async ({ props }) => {
  const idx = await index();
  const s = shareForFeed(idx.byPath.get(props.path as string) as Rec<Feed>, idx);
  const buf = await (props.ig ? instagramCard(s) : linkCard(s));
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/png' } });
};
