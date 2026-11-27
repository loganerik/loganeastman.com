// Title lettering keeps its own colours, but a white or cream logo vanishes on paper. Measure each one once
// and mark the pale ones so CSS can print them as ink. Same-origin images only (/m/…), so the canvas stays clean.
const seen = new WeakSet<HTMLImageElement>();
const measure = (img: HTMLImageElement) => {
  if (seen.has(img) || !img.naturalWidth) return;
  seen.add(img);
  try {
    const w = 48, h = Math.max(4, Math.round((img.naturalHeight / img.naturalWidth) * 48));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 96) continue;
      sum += (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
      n++;
    }
    if (n && sum / n > 0.78) img.classList.add('is-light');
  } catch { /* tainted or unsupported: leave it */ }
};
const scan = () => {
  document.querySelectorAll<HTMLImageElement>('.clip--logo.on-paper > img').forEach((img) => {
    if (img.complete) measure(img); else img.addEventListener('load', () => measure(img), { once: true });
  });
};
scan();
document.addEventListener('astro:page-load', scan);
