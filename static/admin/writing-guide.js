/* Independent of Decap's React tree: opening help preserves the entry form. */
(() => {
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
