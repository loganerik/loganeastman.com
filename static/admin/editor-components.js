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
    id: 'figure', label: 'Figure (framed image)',
    hint: 'An image within the article, with the site’s gold frame, optional caption, and optional green duotone treatment. The Cover image is set separately above Body.',
    fields: [
      { name: 'src', label: 'Image', widget: 'image', media_folder: '', public_folder: '', hint: 'Upload or choose a JPG, PNG, or WebP for this passage. Keep the image beside this entry so the site can resize it.' },
      { name: 'alt', label: 'Alt text', widget: 'string', hint: 'Describe what the image conveys. Screen readers use this text; the caption is a separate visible note.' },
      { name: 'caption', label: 'Caption', widget: 'string', required: false, hint: 'Optional context or photo credit, displayed below the image. Markdown links and emphasis are supported.' },
      { name: 'duotone', label: 'Duotone', widget: 'boolean', default: false, required: false, hint: 'Turn on for the site’s green-toned image treatment. Leave off for the original colors.' },
    ],
    pattern: /^{{< figure src="((?:\\.|[^"\\])*)"(?: alt="((?:\\.|[^"\\])*)")?(?: caption="((?:\\.|[^"\\])*)")?(?: duotone="(true|false)")? >}}$/m,
    fromBlock: match => ({ src: readAttribute(match[1]), alt: readAttribute(match[2]), caption: readAttribute(match[3]), duotone: match[4] === 'true' }),
    toBlock: data => `{{< figure src=${quoteAttribute(data.src)} alt=${quoteAttribute(data.alt)}${data.caption ? ` caption=${quoteAttribute(data.caption)}` : ''}${data.duotone ? ' duotone="true"' : ''} >}}`,
    toPreview: data => `<figure style="border:1px solid #b99c67;padding:4px"><img src="${escapeHTML(data.src)}" alt="${escapeHTML(data.alt)}" style="max-width:100%"><figcaption>${escapeHTML(data.caption)}</figcaption></figure>`,
  });
  // Live preview pane: the site's own stylesheet plus a column-shaped template.
  CMS.registerPreviewStyle('/tryhard/css/tryhard.css');
  CMS.registerPreviewStyle('/admin/preview.css');
  const previewColumn = ({ entry, widgetFor, getAsset }) => {
    const data = entry.get('data');
    const title = data.get('title') || 'Untitled';
    const description = data.get('description') || '';
    const date = data.get('date') ? new Date(data.get('date')) : new Date();
    const dateText = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const cover = data.get('cover');
    const image = cover && cover.get ? cover.get('image') : null;
    const alt = cover && cover.get ? cover.get('alt') || title : title;
    const duotone = cover && cover.get ? !!cover.get('duotone') : false;
    const caption = cover && cover.get ? cover.get('caption') || '' : '';
    return h('div', { className: 'th-site th-preview' },
      h('header', { className: 'th-preview-head' },
        h('p', { className: 'th-preview-sig' }, 'TRYHARD · in a whytry world'),
        h('h1', { className: 'th-preview-title' }, title),
        h('p', { className: 'th-preview-byline' }, `${dateText} ✦ By Logan Eastman`)),
      h('main', { className: 'th-main th-preview-main' },
        h('article', { className: 'th-article' },
          description ? h('div', { className: 'th-explore-head th-post-head' }, h('p', {}, description)) : null,
          image ? h('figure', { className: 'th-figure th-hero-image' },
            h('img', { src: getAsset(image).toString(), alt, className: duotone ? 'th-duotone' : '' }),
            caption ? h('figcaption', {}, caption) : null) : null,
          h('div', { className: 'th-article-body th-prose' }, widgetFor('body')))));
  };
  CMS.registerPreviewTemplate('columns', previewColumn);
  CMS.registerPreviewTemplate('about', ({ entry, widgetFor, getAsset }) => {
    const data = entry.get('data');
    const portrait = data.get('portrait');
    return h('div', { className: 'th-site th-preview' },
      h('header', { className: 'th-preview-head' },
        h('p', { className: 'th-preview-sig' }, 'TRYHARD · in a whytry world'),
        h('h1', { className: 'th-preview-title' }, data.get('title') || 'About')),
      h('main', { className: 'th-main th-preview-main' },
        h('article', { className: 'th-article th-page' },
          portrait ? h('figure', { className: 'th-portrait' }, h('img', { src: getAsset(portrait).toString(), alt: data.get('portraitAlt') || '' })) : null,
          h('div', { className: 'th-article-body th-prose th-prose--plain' }, widgetFor('body')))));
  });

  // Register the blocks before entries or recovered drafts are parsed.
  window.initCMS();
})();
