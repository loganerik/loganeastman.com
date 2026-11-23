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

  const field = (data, key) => {
    if (!data) return undefined;
    return typeof data.get === 'function' ? data.get(key) : data[key];
  };
  CMS.registerEditorComponent({
    id: 'pullquote', label: 'Pull quote',
    hint: 'Sets a short line apart in the site’s green-and-rose quotation panel. For an ordinary quotation, use the toolbar’s Quote tool.',
    fields: [{ name: 'text', label: 'Quote', widget: 'string', hint: 'A short sentence or two from the column. The design adds the opening quotation mark for you.' }],
    pattern: /^{{< pullquote >}}([\s\S]*?){{< \/pullquote >}}$/m,
    fromBlock: match => ({ text: match[1].trim() }),
    toBlock: data => `{{< pullquote >}}\n${data.text || ''}\n{{< /pullquote >}}`,
    toPreview: data => `<blockquote style="text-align:center;font-size:1.3em;border:1px solid #c5d5c6;padding:1em">${escapeHTML(field(data, 'text'))}</blockquote>`,
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
    toPreview: data => `<aside style="border-top:1px solid #b99c67;border-bottom:1px solid #b99c67;padding:1em"><small>${escapeHTML(field(data, 'label') || 'A small digression')}</small><p>${escapeHTML(field(data, 'text'))}</p></aside>`,
  });
  CMS.registerEditorComponent({
    id: 'ornament', label: 'Sunburst divider',
    hint: 'Inserts the small Art Deco sunburst between passages. There are no settings; continue writing in the next paragraph.',
    fields: [],
    pattern: /^{{< ornament >}}$/m,
    fromBlock: () => ({}),
    toBlock: () => '{{< ornament >}}',
    toPreview: () => '<div class="th-inline-ornament" role="separator"><span></span><img src="/tryhard/ornaments/sunburst.svg" alt="" width="65" height="28"><span></span></div>',
  });
  CMS.registerEditorComponent({
    id: 'rule', label: 'Diamond divider',
    hint: 'A short gold hairline with a small diamond, for a quiet break between passages. In Markdown this is three dashes on their own line.',
    fields: [],
    pattern: /^(?:-{3,}|\*{3,})$/m,
    fromBlock: () => ({}),
    toBlock: () => '---',
    toPreview: () => '<hr>',
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
      const src0 = field(data, 'src');
      let src = src0 ? String(src0) : '';
      if (src && typeof getAsset === 'function') { try { const a = getAsset(src); if (a) src = a.toString(); } catch (e) {} }
      const plain = field(data, 'frame') === false ? ' th-figure--plain' : '';
      const duo = field(data, 'duotone') ? 'th-duotone' : '';
      const caption = field(data, 'caption');
      return `<figure class="th-figure${plain}">${src ? `<img class="${duo}" src="${escapeHTML(src)}" alt="${escapeHTML(field(data, 'alt'))}">` : '<div style="padding:2em;text-align:center;color:#6a5346">Choose an image</div>'}${caption ? `<figcaption>${escapeHTML(caption)}</figcaption>` : ''}</figure>`;
    },
  });
  // "taglist": one comma-separated box for tags/categories that keeps the spaces you type.
  // The stock list widget re-parses on every keystroke and trims a trailing space, which
  // makes two-word tags impossible to type; this one only tidies the text when you leave it.
  const toArray = value => {
    if (!value) return [];
    if (typeof value.toJS === 'function') return value.toJS();
    if (Array.isArray(value)) return value;
    return String(value).split(',');
  };
  const parse = text => text.split(',').map(t => t.trim()).filter(Boolean);
  const TagListControl = createClass({
    getInitialState() { return { text: toArray(this.props.value).join(', ') }; },
    componentDidUpdate(prev) {
      // Adopt outside changes (loading an entry) but never fight the user's typing.
      if (prev.value !== this.props.value && document.activeElement !== this.input) {
        const text = toArray(this.props.value).join(', ');
        if (parse(text).join('|') !== parse(this.state.text).join('|')) this.setState({ text });
      }
    },
    handleChange(e) {
      const text = e.target.value;
      this.setState({ text });
      this.props.onChange(parse(text));
    },
    handleBlur() {
      this.setState({ text: parse(this.state.text).join(', ') });
      this.props.setInactiveStyle();
    },
    render() {
      return h('input', {
        type: 'text', id: this.props.forID, className: this.props.classNameWrapper,
        value: this.state.text, ref: el => { this.input = el; },
        onChange: this.handleChange, onFocus: this.props.setActiveStyle, onBlur: this.handleBlur,
        placeholder: 'one, two words, three', autoComplete: 'off',
      });
    },
  });
  const TagListPreview = createClass({
    render() { return h('span', {}, toArray(this.props.value).join(', ')); },
  });
  CMS.registerWidget('taglist', TagListControl, TagListPreview);

  // Live preview pane: the site's own stylesheet plus a column-shaped template.
  // Version the preview stylesheets from this script's own ?v= so a deploy is never served stale.
  const V = (document.currentScript && (document.currentScript.src.split('?v=')[1] || '')) || String(Date.now());
  CMS.registerPreviewStyle('/tryhard/css/tryhard.css?v=' + V);
  CMS.registerPreviewStyle('/admin/preview.css?v=' + V);
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
  // Show the real failure inside the pane instead of a generic message.
  const guarded = (name, template) => props => {
    try { return template(props); }
    catch (err) {
      console.error('TRYHARD preview (' + name + ') failed:', err);
      return h('pre', { style: 'white-space:pre-wrap;padding:16px;color:#7a2e2e;font:13px/1.5 ui-monospace,monospace' },
        'Preview template "' + name + '" failed:\n' + (err && err.stack ? err.stack : String(err)));
    }
  };
  CMS.registerPreviewTemplate('columns', guarded('columns', previewColumn));
  CMS.registerPreviewTemplate('about', guarded('about', ({ entry, widgetFor, getAsset }) => {
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
  }));

  // Register the blocks before entries or recovered drafts are parsed.
  window.initCMS();
})();
