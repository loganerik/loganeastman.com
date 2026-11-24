import { webUrl } from './catalog.js';

function publicUrl(value) {
  const url = webUrl(value);
  if (!url || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      /\.(localhost|local|internal|test|invalid|onion)$/i.test(url.hostname)) return null;
  return url;
}
export async function preview(value) {
  let url = publicUrl(value);
  if (!url) return {};
  const signal = AbortSignal.timeout(12000);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url.href,{redirect:'manual',signal,headers:{Accept:'text/html'}});
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('Location');
      await res.body?.cancel();
      if (!location || !(url=publicUrl(new URL(location,url).href))) return {};
      continue;
    }
    if (!res.ok || !res.headers.get('Content-Type')?.includes('text/html')) {
      await res.body?.cancel();
      return {};
    }
    const meta = {};
    const entities = [];
    let title = '', script = '';
    const stream = new HTMLRewriter()
      .on('meta', {element(el) {
        const key = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
        if (/^(og:|twitter:|product:|description$)/.test(key) && !meta[key]) meta[key] = el.getAttribute('content');
      }})
      .on('title', {text(t) { title += t.text; }})
      .on('script[type="application/ld+json"]', {
        element(el) {
          script = '';
          el.onEndTag(() => {
            try {
              const doc = JSON.parse(script);
              for (const node of [doc].flat()) entities.push(...[node, ...(Array.isArray(node?.['@graph']) ? node['@graph'] : [])]);
            } catch { /* Some shops include non-JSON scripts in their markup. */ }
          });
        },
        text(t) { if (script.length < 600000) script += t.text; }
      }).transform(res);
    const reader = stream.body.getReader();
    let size = 0;
    try {
      while (size < 3000000) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
      }
    } finally { await reader.cancel(); }
    return extractFields(url, title, meta, entities);
  }
  return {};
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() : '';
}
function named(value) {
  return clean(typeof value === 'string' ? value : value?.name);
}
function imageUrl(value, base) {
  for (const candidate of [value].flat()) {
    const src = typeof candidate === 'string' ? candidate : candidate?.url || candidate?.contentUrl;
    if (src) {
      try { const url = publicUrl(new URL(src, base).href); if (url) return url.href; } catch { /* Try another source. */ }
    }
  }
  return '';
}
export function extractFields(url, title, meta, entities) {
  const nodes = type => entities.filter(node => [node?.['@type']].flat().includes(type));
  const shop = nodes('Organization')[0];
  const variant = url.searchParams.get('variant');
  const variantMatches = node => {
    try { return !!variant && !!node?.url && new URL(node.url,url).searchParams.get('variant') === variant; } catch { return false; }
  };
  const products = [...nodes('Product'), ...nodes('ProductGroup').flatMap(p => p.hasVariant || [])];
  const isHome = url.pathname === '/';
  const product = isHome ? null : products.find(variantMatches) || products.find(p => p.name) || nodes('ProductGroup')[0];
  const offers = [product?.offers || []].flat().filter(Boolean);
  const selected = offers.find(variantMatches);
  const samePrice = offers.length && offers.every(o => o.price != null && String(o.price) === String(offers[0].price) && o.priceCurrency === offers[0].priceCurrency);
  const offer = selected || (samePrice ? offers[0] : null);
  const currency = offer?.priceCurrency || meta['product:price:currency'] || meta['og:price:currency'];
  const amount = offer?.price ?? meta['product:price:amount'] ?? meta['og:price:amount'];
  const price = currency === 'USD' && amount != null && String(amount).trim() && Number.isFinite(Number(amount)) ? String(amount) : '';
  const brand = named(product?.brand) || clean(meta['og:site_name']) || named(shop);
  const name = named(product) || (isHome ? brand : '') || clean(meta['og:title'] || meta['twitter:title'] || title);
  const type = named(product?.category) || clean(meta['product:category'] || meta['product:type']);
  const apparel = /\b(t.?shirts?|tees?|jeans|sweaters?|trousers|jackets?|hoodies|shirts?|shorts|apparel|clothing)\b/i;
  const category = apparel.test(type+' '+name) ? 'Apparel' : type;
  const itemType = /\b(tee|t-shirt)s?\b/i.test(type+' '+name) ? 'T-shirts' : type;
  const description = clean(product?.description || meta['og:description'] || meta.description);
  const item = products.find(variantMatches) || product;
  const details = [named(item?.size), named(item?.color)].filter(Boolean).join(' · ');
  const image = imageUrl(product?.image,url) || imageUrl(meta['og:image'] || meta['twitter:image'],url) || imageUrl(shop?.logo,url);
  return {name:name.slice(0,300), brand, category, type:itemType, price, details, image,
    note:description && description.toLowerCase() !== name.toLowerCase() ? 'From the shop: '+(description.length > 320 ? description.slice(0,317).replace(/\s+\S*$/, '')+'…' : description) : '',
    label:[type || category, brand].filter(Boolean).join(' · ')};
}
