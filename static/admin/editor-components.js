/* Hugo blocks in the Markdown editor's + menu. Field hints stay beside
   their controls; the writing guide supplies full source examples. */
(() => {
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const quoteAttribute = value => JSON.stringify(String(value ?? ''));
  const readAttribute = value => {
    try { return JSON.parse(`"${value || ''}"`); } catch { return value || ''; }
  };

  CMS.registerEditorComponent({
    id: 'pullquote', label: 'Pull quote',
    hint: 'Sets a short line apart in the site’s green-and-rose quotation panel. For an ordinary quotation, use the toolbar’s Quote tool.',
    fields: [{ name: 'text', label: 'Quote', widget: 'string', hint: 'A short sentence or two from the column. The design adds the opening quotation mark for you.' }],
    pattern: /^{{< pullquote >}}([\s\S]*?){{< \/pullquote >}}$/m,
    fromBlock: match => ({ text: match[1].trim() }),
    toBlock: data => `{{< pullquote >}}\n${data.text || ''}\n{{< /pullquote >}}`,
    toPreview: data => `<blockquote style="text-align:center;font-size:1.3em;border:1px solid #c5d5c6;padding:1em">${escapeHTML(data.text)}</blockquote>`,
  });
  CMS.registerEditorComponent({
    id: 'aside', label: 'Aside (digression)',
    hint: 'A separate note for a digression, qualification, or source detail. It stays in the reading column.',
    fields: [
      { name: 'label', label: 'Label', widget: 'string', required: false, hint: 'Optional short heading, such as “A note on sources”. Leave blank for “A small digression”.' },
      { name: 'text', label: 'Text', widget: 'text', hint: 'Write the note here. Markdown links, emphasis, and multiple paragraphs are supported; separate paragraphs with a blank line.' },
    ],
    pattern: /^{{< aside(?: label="((?:\\.|[^"\\])*)")? >}}([\s\S]*?){{< \/aside >}}$/m,
    fromBlock: match => ({ label: readAttribute(match[1]), text: match[2].trim() }),
    toBlock: data => `{{< aside${data.label ? ` label=${quoteAttribute(data.label)}` : ''} >}}\n${data.text || ''}\n{{< /aside >}}`,
    toPreview: data => `<aside style="border-top:1px solid #b99c67;border-bottom:1px solid #b99c67;padding:1em"><small>${escapeHTML(data.label || 'A small digression')}</small><p>${escapeHTML(data.text)}</p></aside>`,
  });
  CMS.registerEditorComponent({
    id: 'ornament', label: 'Sunburst divider',
    hint: 'Inserts the small Art Deco sunburst between passages. There are no settings; continue writing in the next paragraph.',
    fields: [],
    pattern: /^{{< ornament >}}$/m,
    fromBlock: () => ({}),
    toBlock: () => '{{< ornament >}}',
    toPreview: () => '<p style="text-align:center;color:#b99c67">— ✦ —</p>',
  });
  CMS.registerEditorComponent({
    id: 'figure', label: 'Figure (image)',
    hint: 'An image within the article: framed in gold or plain, with optional caption and optional green duotone. The Cover image is set separately above Body.',
    fields: [
      { name: 'src', label: 'Image', widget: 'image', media_folder: '', public_folder: '', hint: 'Upload or choose a JPG, PNG, or WebP for this passage. Keep the image beside this entry so the site can resize it.' },
      { name: 'alt', label: 'Alt text', widget: 'string', hint: 'Describe what the image conveys. Screen readers use this text; the caption is a separate visible note.' },
      { name: 'caption', label: 'Caption', widget: 'string', required: false, hint: 'Optional context or photo credit, displayed below the image. Markdown links and emphasis are supported.' },
      { name: 'frame', label: 'Gold frame', widget: 'boolean', default: true, required: false, hint: 'On: the site’s thin gold frame. Off: the image sits plain on the page.' },
      { name: 'duotone', label: 'Duotone', widget: 'boolean', default: false, required: false, hint: 'Turn on for the site’s green-toned image treatment. Works with or without the frame.' },
    ],
    pattern: /^{{< figure src="((?:\\.|[^"\\])*)"(?: alt="((?:\\.|[^"\\])*)")?(?: caption="((?:\\.|[^"\\])*)")?(?: duotone="(true|false)")?(?: frame="(true|false)")? >}}$/m,
    fromBlock: match => ({ src: readAttribute(match[1]), alt: readAttribute(match[2]), caption: readAttribute(match[3]), duotone: match[4] === 'true', frame: match[5] !== 'false' }),
    toBlock: data => `{{< figure src=${quoteAttribute(data.src)} alt=${quoteAttribute(data.alt)}${data.caption ? ` caption=${quoteAttribute(data.caption)}` : ''}${data.duotone ? ' duotone="true"' : ''}${data.frame === false ? ' frame="false"' : ''} >}}`,
    toPreview: (data, getAsset) => {
      const asset = data.src ? getAsset(data.src) : null;
      const src = asset ? asset.toString() : '';
      const plain = data.frame === false ? ' th-figure--plain' : '';
      const duo = data.duotone ? 'th-duotone' : '';
      return `<figure class="th-figure${plain}"><img class="${duo}" src="${escapeHTML(src)}" alt="${escapeHTML(data.alt)}">${data.caption ? `<figcaption>${escapeHTML(data.caption)}</figcaption>` : ''}</figure>`;
    },
  });
  // Live preview pane: the site's own stylesheet plus a column-shaped template.
  CMS.registerPreviewStyle('/tryhard/css/tryhard.css');
  CMS.registerPreviewStyle('/admin/preview.css');
  // Reads a value from the entry whether it arrives as an Immutable map, a plain object, or nothing yet.
  const reader = entry => {
    const data = entry && typeof entry.get === 'function' ? entry.get('data') : (entry && entry.data);
    return (...path) => {
      let node = data;
      for (const key of path) {
        if (node == null) return undefined;
        node = typeof node.get === 'function' ? node.get(key) : node[key];
      }
      return node;
    };
  };
  const assetURL = (getAsset, value) => {
    if (!value) return '';
    try { const a = getAsset(value); return a ? a.toString() : String(value); } catch (e) { return String(value); }
  };
  const previewColumn = ({ entry, widgetFor, getAsset }) => {
    const get = reader(entry);
    const title = get('title') || 'Untitled';
    const description = get('description') || '';
    const raw = get('date');
    const date = raw ? new Date(raw) : new Date();
    const dateText = isNaN(date) ? '' : date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const image = get('cover', 'image');
    const alt = get('cover', 'alt') || title;
    const duotone = !!get('cover', 'duotone');
    const caption = get('cover', 'caption') || '';
    return h('div', { className: 'th-site th-preview' },
      h('header', { className: 'th-preview-head' },
        h('p', { className: 'th-preview-sig' }, 'TRYHARD · in a whytry world'),
        h('h1', { className: 'th-preview-title' }, title),
        h('p', { className: 'th-preview-byline' }, `${dateText} ✦ By Logan Eastman`)),
      h('main', { className: 'th-main th-preview-main' },
        h('article', { className: 'th-article' },
          description ? h('div', { className: 'th-explore-head th-post-head' }, h('p', {}, description)) : null,
          image ? h('figure', { className: 'th-figure th-hero-image' },
            h('img', { src: assetURL(getAsset, image), alt, className: duotone ? 'th-duotone' : '' }),
            caption ? h('figcaption', {}, caption) : null) : null,
          h('div', { className: 'th-article-body th-prose' }, widgetFor('body')))));
  };
  CMS.registerPreviewTemplate('columns', previewColumn);
  CMS.registerPreviewTemplate('about', ({ entry, widgetFor, getAsset }) => {
    const get = reader(entry);
    const portrait = get('portrait');
    return h('div', { className: 'th-site th-preview' },
      h('header', { className: 'th-preview-head' },
        h('p', { className: 'th-preview-sig' }, 'TRYHARD · in a whytry world'),
        h('h1', { className: 'th-preview-title' }, get('title') || 'About')),
      h('main', { className: 'th-main th-preview-main' },
        h('article', { className: 'th-article th-page' },
          portrait ? h('figure', { className: 'th-portrait' }, h('img', { src: assetURL(getAsset, portrait), alt: get('portraitAlt') || '' })) : null,
          h('div', { className: 'th-article-body th-prose th-prose--plain' }, widgetFor('body')))));
  });

  // Register the blocks before entries or recovered drafts are parsed.
  window.initCMS();
})();
