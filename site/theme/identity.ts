// Everything a different person would change lives here. src/ never hard-codes a name, colour, pet or collection.
export interface Mascot { id: string; label: string; poses: Record<string, string>; sizes?: Record<string, [number, number]> }
export interface Identity {
  site: { name: string; url: string; tagline: string; locale: string; description: string };
  owner: { name: string; face: { src: string; w: number; h: number } };
  mascots: Mascot[];
  placements: { nav: string[]; about: string[]; wall: Array<{ who: string; after: number; side: 'left' | 'right' }> };
  nav: Array<{ label: string; href: string }>;
  footer: { about: { label: string; href: string } };
  writing: { rootCollections: string[] };
  kinds: Record<string, { route: string; label: string; plural: string; treatment: string }>;
  wall: { maxTiles: number; quotas: Record<string, number>; perturbation: number };
}

const identity: Identity = {
  site: {
    name: 'Logan Eastman',
    url: 'https://loganeastman.com',
    tagline: 'A collection on paper',
    locale: 'en-US',
    description: 'Writing, short thoughts, lists, reviews, and what is coming up, arranged on warm paper.',
  },
  owner: { name: 'Logan', face: { src: 'logan-face.webp', w: 98, h: 128 } },
  mascots: [
    { id: 'ares', label: 'Ares', poses: { upright: 'ares.webp', lounging: 'ares-lounging.webp', resting: 'ares-resting.webp' },
      sizes: { upright: [460, 289], lounging: [480, 246], resting: [480, 320] } },
    { id: 'artemis', label: 'Artemis', poses: { upright: 'artemis.webp', resting: 'artemis-resting.webp', stretching: 'artemis-stretching.webp' },
      sizes: { upright: [460, 319], resting: [480, 320], stretching: [480, 362] } },
    { id: 'toast', label: 'Toast', poses: { sofa: 'pom-sofa.webp', rug: 'pom-rug.webp', quilt: 'pom-quilt.webp' },
      sizes: { sofa: [490, 324], rug: [490, 350], quilt: [488, 490] } },
    { id: 'pair', label: 'Ares and Artemis', poses: { home: 'cats-upright-photo.webp' }, sizes: { home: [480, 720] } },
  ],
  placements: {
    nav: ['pair:home'],
    about: ['face'],
    wall: [
      { who: 'ares:lounging', after: 1, side: 'right' },
      { who: 'artemis:stretching', after: 3, side: 'right' },
      { who: 'toast:sofa', after: 6, side: 'right' },
      { who: 'ares:resting', after: 9, side: 'left' },
      { who: 'artemis:resting', after: 12, side: 'right' },
      { who: 'toast:rug', after: 16, side: 'left' },
    ],
  },
  nav: [
    { label: 'Writing', href: '/writing/' },
    { label: 'Feed', href: '/feed/' },
    { label: 'Lists', href: '/lists/' },
    { label: 'Reviews', href: '/reviews/' },
    { label: 'Horizon', href: '/horizon/' },
  ],
  footer: { about: { label: 'About', href: '/about/' } },
  writing: { rootCollections: ['pages'] },
  kinds: {
    film: { route: 'film', label: 'Film', plural: 'Films', treatment: 'lettering' },
    tv: { route: 'tv', label: 'Series', plural: 'Series', treatment: 'lettering' },
    book: { route: 'books', label: 'Book', plural: 'Books', treatment: 'cover' },
    album: { route: 'albums', label: 'Album', plural: 'Albums', treatment: 'cover' },
    product: { route: 'things', label: 'Thing', plural: 'Things', treatment: 'cutout' },
    place: { route: 'places', label: 'Place', plural: 'Places', treatment: 'cutout' },
    link: { route: 'links', label: 'Link', plural: 'Links', treatment: 'typeset' },
    photo: { route: 'photos', label: 'Photo', plural: 'Photos', treatment: 'cutout' },
  },
  wall: { maxTiles: 36, quotas: { photo: 12, piece: 8, thought: 8, pick: 6, queue: 3, review: 4, gift: 2 }, perturbation: 14 },
};
export default identity;
