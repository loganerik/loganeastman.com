/* Independent of Decap's React tree: opening help preserves the entry form. */
(() => {
  // Preview build link: each unpublished column lives on branch cms/columns/<slug>,
  // which Cloudflare Pages builds at https://<branch>.loganeastman-com.pages.dev.
  const PAGES_HOST = 'loganeastman-com.pages.dev';
  const previewLink = document.createElement('a');
  previewLink.id = 'th-preview-link';
  previewLink.target = '_blank';
  previewLink.rel = 'noopener';
  previewLink.hidden = true;
  previewLink.textContent = 'Preview build ↗';
  document.body.appendChild(previewLink);
  const updatePreviewLink = () => {
    const m = location.hash.match(/^#\/collections\/(columns|pages)\/entries\/([^/?#]+)/);
    if (!m) { previewLink.hidden = true; return; }
    const [, collection, slug] = m;
    const branch = `cms-${collection}-${slug}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28).replace(/-+$/, '');
    const path = collection === 'columns' ? `/columns/${slug}/` : '/about/';
    previewLink.href = `https://${branch}.${PAGES_HOST}${path}`;
    previewLink.title = 'Opens the private preview build of this unpublished entry. It appears a minute or two after you save.';
    previewLink.hidden = false;
  };
  window.addEventListener('hashchange', updatePreviewLink);
  updatePreviewLink();

  const launcher = document.getElementById('th-guide-launcher');
  const dialog = document.getElementById('th-writing-guide');
  const status = document.getElementById('th-guide-status');
  if (!launcher || !dialog) return;

  launcher.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('[data-close-guide]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });

  dialog.querySelectorAll('[data-guide-section]').forEach(button => {
    button.addEventListener('click', () => {
      const section = document.getElementById(button.dataset.guideSection);
      section.open = true;
      const body = dialog.querySelector('.th-guide-body');
      const top = section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 12;
      body.scrollTo({ top });
      section.querySelector('summary').focus({ preventScroll: true });
    });
  });

  dialog.querySelectorAll('[data-copy-example]').forEach(button => {
    button.addEventListener('click', async () => {
      const code = button.closest('.th-guide-example').querySelector('code');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
        status.textContent = 'Example copied. Switch Body to Markdown mode, place the cursor where the block belongs, and paste.';
        window.setTimeout(() => { button.textContent = 'Copy example'; }, 2000);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'The example is selected. Copy it with your usual keyboard shortcut, then paste it into Body in Markdown mode.';
      }
    });
  });
})();
