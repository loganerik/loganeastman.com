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
  const signal = AbortSignal.timeout(6500);
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
    let title = '';
    const reader = new HTMLRewriter().on('meta',{element(el){
      const key = el.getAttribute('property') || el.getAttribute('name');
      if (['og:title','og:image','twitter:image','twitter:title','og:site_name'].includes(key) && !meta[key]) meta[key]=el.getAttribute('content');
    }}).on('title',{text(t){title+=t.text;}}).transform(res).body.getReader();
    try {
      let size=0;
      while (size<350000 && !(meta['og:title'] && meta['og:image'])) {
        const part=await reader.read();
        if (part.done) break;
        size+=part.value.byteLength;
      }
    } finally { await reader.cancel(); }
    const img=meta['og:image'] || meta['twitter:image'];
    return {name:(meta['og:title'] || meta['twitter:title'] || title).trim().slice(0,300),
      image:img ? publicUrl(new URL(img,url).href)?.href || '' : '',brand:meta['og:site_name'] || ''};
  }
  return {};
}
