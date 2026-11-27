// What a thought or a piece shows on its share image.
import type { Feed, Item, Writing } from '@lem/vault-core';
import type { VaultIndex } from '../../loaders/index';
import type { Rec } from '../content';
import { fmtDate } from '../dates';
import type { ShareInput } from './card';

type Art = { clip?: string; thumb?: string; full?: string; treatment?: string };
// the picture as the site shows it: the cutout when that is the treatment, else the whole picture
const pick = (a?: Art) => {
  if (!a) return {};
  const cut = !!a.clip && (a.treatment === 'cutout' || !a.treatment);
  const whole = [a.full, a.thumb].filter(Boolean) as string[];
  return { picture: cut ? [a.clip!, ...whole] : whole, cutout: cut };
};

const smart = (t: string) => t.replace(/(^|[\s(\[])"/g, '$1\u201c').replace(/"/g, '\u201d').replace(/(^|[\s(\[])'/g, '$1\u2018').replace(/'/g, '\u2019');
export const plain = (md: string) => smart(rawPlain(md));
const rawPlain = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/[#>*_`~]/g, '').replace(/\s+/g, ' ').trim();

export function shareForFeed(post: Rec<Feed>, idx: VaultIndex): ShareInput {
  const about = post.data.about ? idx.resolve(post.data.about) : undefined;
  const att = about?.public && about.type === 'item' ? (about as Rec<Item>) : undefined;
  const own = post.data.artwork as Art | undefined;
  const text = plain(post.body) || post.data.title || '';
  const hasTime = String(post.data.date).length > 10;
  return {
    kind: 'thought', text,
    kicker: fmtDate(post.data.date, { month: 'short', day: 'numeric', year: 'numeric' }) + (hasTime ? ' · ' + fmtDate(post.data.date, { hour: 'numeric', minute: '2-digit' }) : ''),
    sub: att?.data.title, subKicker: att ? ((att.data as { site_name?: string }).site_name ?? undefined) : undefined,
    ...(own?.clip || own?.thumb ? pick(own) : pick(att?.data.artwork as Art | undefined)),
  };
}

export function shareForPiece(piece: Rec<Writing>, idx: VaultIndex): ShareInput {
  const c = idx.config.collections.find((x) => x.key === piece.data.collection);
  return { kind: 'piece', text: piece.data.title, kicker: `${c?.title ?? piece.data.collection} · ${fmtDate(piece.data.date)}`, sub: piece.data.summary, ...pick(piece.data.artwork as Art | undefined) };
}
