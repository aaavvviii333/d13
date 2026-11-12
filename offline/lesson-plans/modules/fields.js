// modules/fields.js — the form widgets. Every one of them mutates the array or
// object it is handed, then calls onChange(). Nothing here knows about lesson
// plans specifically.

// ---------------------------------------------------------------- tiny DOM helper

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

export const clear = node => { while (node.firstChild) node.firstChild.remove(); return node; };

export function iconBtn(label, title, onclick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title, 'aria-label': title, onClick: onclick }, label);
}

// ---------------------------------------------------------------- drag to reorder
//
// Native HTML5 drag and drop. Lists sharing a `group` accept each other's items,
// which is what lets a schedule block move between phases.

let dragging = null;

/**
 * sortable(listEl, { group, listId, onMove })
 * Items are direct children carrying data-index. onMove gets
 * { fromList, fromIndex, toList, toIndex } and is responsible for the data move
 * and the re-render.
 */
export function sortable(listEl, { group, listId, onMove }) {
  listEl.dataset.group = group;
  listEl.dataset.listId = String(listId);

  for (const item of listEl.children) {
    if (!item.dataset.index) continue;
    item.draggable = true;
    item.addEventListener('dragstart', e => {
      // Lists nest (blocks inside phases, checklist inside checklist). Without
      // this the ancestor's dragstart fires next and claims the drag.
      e.stopPropagation();
      dragging = { group, listId: String(listId), index: +item.dataset.index };
      item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      // Firefox will not start a drag without data set.
      e.dataTransfer.setData('text/plain', item.dataset.index);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      listEl.querySelectorAll('.drop-before, .drop-after').forEach(n =>
        n.classList.remove('drop-before', 'drop-after'));
      dragging = null;
    });
  }

  listEl.addEventListener('dragover', e => {
    if (!dragging || dragging.group !== group) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { item, after } = nearest(listEl, e.clientY);
    listEl.querySelectorAll('.drop-before, .drop-after').forEach(n =>
      n.classList.remove('drop-before', 'drop-after'));
    if (item) item.classList.add(after ? 'drop-after' : 'drop-before');
    else listEl.classList.add('drop-before');
  });

  listEl.addEventListener('dragleave', e => {
    if (e.target === listEl) listEl.querySelectorAll('.drop-before, .drop-after')
      .forEach(n => n.classList.remove('drop-before', 'drop-after'));
  });

  listEl.addEventListener('drop', e => {
    if (!dragging || dragging.group !== group) return;
    e.preventDefault();
    e.stopPropagation();
    const { item, after } = nearest(listEl, e.clientY);
    let toIndex = item ? +item.dataset.index + (after ? 1 : 0) : listEl.children.length;
    const from = dragging;
    dragging = null;
    if (from.listId === String(listId)) {
      if (toIndex > from.index) toIndex--;
      if (toIndex === from.index) return;
    }
    onMove({ fromList: from.listId, fromIndex: from.index, toList: String(listId), toIndex });
  });
}

function nearest(listEl, y) {
  const items = [...listEl.children].filter(c => c.dataset.index && !c.classList.contains('is-dragging'));
  for (const item of items) {
    const box = item.getBoundingClientRect();
    if (y < box.top + box.height / 2) return { item, after: false };
  }
  const last = items.at(-1);
  return last ? { item: last, after: true } : { item: null, after: false };
}

/** Move an item within one array. */
export function moveItem(list, from, to) {
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  return list;
}

// ---------------------------------------------------------------- list of strings

/**
 * stringList(items, { onChange, placeholder, addLabel, multiline, stem, group })
 * Ordered, reorderable list of plain strings. Returns the container element.
 */
export function stringList(items, opts = {}) {
  const { onChange, placeholder = '', addLabel = 'Add item', multiline = true, stem = '' } = opts;
  const group = opts.group || `sl-${Math.random().toString(36).slice(2)}`;
  const wrap = el('div', { class: 'field-list' });

  function render() {
    clear(wrap);
    const list = el('ol', { class: 'ol-rows' });

    items.forEach((value, i) => {
      const input = multiline
        ? el('textarea', { class: 'inp grow', rows: 2, value, placeholder,
            onInput: e => { items[i] = e.target.value; autoGrow(e.target); onChange?.(); } })
        : el('input', { class: 'inp grow', type: 'text', value, placeholder,
            onInput: e => { items[i] = e.target.value; onChange?.(); } });

      if (stem) {
        input.addEventListener('focus', () => {
          if (!input.value) { input.value = stem; items[i] = stem; onChange?.();
            input.setSelectionRange(stem.length, stem.length); }
        });
      }

      list.append(el('li', { class: 'row', dataset: { index: i } },
        el('span', { class: 'grip', title: 'Drag to reorder' }, '⠿'),
        input,
        el('div', { class: 'row-tools' },
          iconBtn('↑', 'Move up',   () => { if (i > 0) { moveItem(items, i, i - 1); onChange?.(); render(); } }),
          iconBtn('↓', 'Move down', () => { if (i < items.length - 1) { moveItem(items, i, i + 1); onChange?.(); render(); } }),
          iconBtn('✕', 'Remove',    () => { items.splice(i, 1); onChange?.(); render(); }, 'icon-btn--danger'),
        )));
    });

    if (!items.length) list.append(el('li', { class: 'empty' }, 'Nothing here yet.'));

    sortable(list, { group, listId: 'main', onMove: ({ fromIndex, toIndex }) => {
      moveItem(items, fromIndex, toIndex); onChange?.(); render();
    } });

    wrap.append(list, el('button', {
      type: 'button', class: 'btn btn--ghost',
      onClick: () => {
        items.push(stem);
        onChange?.(); render();
        wrap.querySelector('li:last-of-type .inp')?.focus();
      },
    }, `+ ${addLabel}`));

    wrap.querySelectorAll('textarea').forEach(autoGrow);
  }

  render();
  return wrap;
}

/** Textareas can only size themselves once they are in the document. */
export function growAll(root) {
  root.querySelectorAll('textarea').forEach(autoGrow);
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

// ---------------------------------------------------------------- repeatable rows

/**
 * rowList(rows, columns, { onChange, blank, addLabel })
 * columns: [{ key, label, type, width, placeholder }]
 */
export function rowList(rows, columns, opts = {}) {
  const { onChange, blank, addLabel = 'Add row' } = opts;
  const group = `rl-${Math.random().toString(36).slice(2)}`;
  const wrap = el('div', { class: 'field-list' });

  function render() {
    clear(wrap);
    const grid = `auto ${columns.map(c => c.width || '1fr').join(' ')} auto`;

    const head = el('div', { class: 'row-head', style: `grid-template-columns:${grid}` },
      el('span', {}), columns.map(c => el('span', {}, c.label)), el('span', {}));

    const list = el('div', { class: 'grid-rows' });
    rows.forEach((row, i) => {
      list.append(el('div', { class: 'row grid-row', dataset: { index: i },
        style: `grid-template-columns:${grid}` },
        el('span', { class: 'grip', title: 'Drag to reorder' }, '⠿'),
        columns.map(c => el('input', {
          class: 'inp', type: c.type || 'text', value: row[c.key] ?? '',
          placeholder: c.placeholder || '', 'aria-label': c.label,
          onInput: e => {
            row[c.key] = c.type === 'number' && e.target.value !== ''
              ? Number(e.target.value) : e.target.value;
            onChange?.();
          },
        })),
        el('div', { class: 'row-tools' },
          iconBtn('↑', 'Move up',   () => { if (i > 0) { moveItem(rows, i, i - 1); onChange?.(); render(); } }),
          iconBtn('↓', 'Move down', () => { if (i < rows.length - 1) { moveItem(rows, i, i + 1); onChange?.(); render(); } }),
          iconBtn('✕', 'Remove',    () => { rows.splice(i, 1); onChange?.(); render(); }, 'icon-btn--danger'))));
    });

    if (!rows.length) list.append(el('div', { class: 'empty' }, 'Nothing here yet.'));

    sortable(list, { group, listId: 'main', onMove: ({ fromIndex, toIndex }) => {
      moveItem(rows, fromIndex, toIndex); onChange?.(); render();
    } });

    wrap.append(rows.length ? head : '', list, el('button', {
      type: 'button', class: 'btn btn--ghost',
      onClick: () => { rows.push(blank()); onChange?.(); render();
        wrap.querySelector('.grid-row:last-of-type .inp')?.focus(); },
    }, `+ ${addLabel}`));
  }

  render();
  return wrap;
}

export const linkColumns = [
  { key: 'label', label: 'Label', placeholder: 'What is it?' },
  { key: 'url', label: 'Link', type: 'url', placeholder: 'https://…' },
];
export const blankLink = () => ({ label: '', url: '' });

// ---------------------------------------------------------------- nested checklist

/**
 * checklist(nodes, { onChange })
 * Real checkboxes, arbitrary nesting. Tab / Shift-Tab indent and outdent,
 * Enter adds a sibling — the shortcuts people already expect from a doc.
 */
export function checklist(nodes, { onChange } = {}) {
  const wrap = el('div', { class: 'field-list checklist' });

  function render(focusPath) {
    clear(wrap);
    wrap.append(level(nodes, []));
    if (!nodes.length) wrap.append(el('div', { class: 'empty' }, 'Nothing here yet.'));
    wrap.append(el('button', {
      type: 'button', class: 'btn btn--ghost',
      onClick: () => { nodes.push(blankNode()); onChange?.(); render([nodes.length - 1]); },
    }, '+ Add prep item'));
    if (focusPath) {
      const target = wrap.querySelector(`[data-path="${focusPath.join('.')}"] .inp`);
      target?.focus();
    }
  }

  function level(list, path) {
    const ul = el('ul', { class: 'checklist-level' });

    list.forEach((node, i) => {
      const here = [...path, i];
      const li = el('li', { class: 'checklist-item', dataset: { index: i, path: here.join('.') } },
        el('div', { class: 'check-row' },
          el('span', { class: 'grip', title: 'Drag to reorder' }, '⠿'),
          el('input', { type: 'checkbox', class: 'chk', checked: node.checked,
            'aria-label': node.text || 'prep item',
            onChange: e => { node.checked = e.target.checked; onChange?.(); } }),
          el('input', { type: 'text', class: 'inp grow', value: node.text, placeholder: 'Prep step…',
            onInput: e => { node.text = e.target.value; onChange?.(); },
            onKeydown: e => onKey(e, list, i, here) }),
          el('div', { class: 'row-tools' },
            iconBtn('↳', 'Add sub-item', () => {
              node.children.push(blankNode()); onChange?.(); render([...here, node.children.length - 1]);
            }),
            iconBtn('✕', 'Remove', () => { list.splice(i, 1); onChange?.(); render(); }, 'icon-btn--danger'))),
        node.children.length ? level(node.children, here) : null);
      ul.append(li);
    });

    sortable(ul, { group: 'checklist', listId: path.join('.') || 'root',
      onMove: ({ fromList, fromIndex, toList, toIndex }) => {
        const src = listAt(fromList), dst = listAt(toList);
        if (src === dst) moveItem(src, fromIndex, toIndex);
        else {
          const [moved] = src.splice(fromIndex, 1);
          if (!moved) return;
          dst.splice(toIndex, 0, moved);
        }
        onChange?.(); render();
      } });

    return ul;
  }

  function listAt(pathStr) {
    if (pathStr === 'root' || pathStr === '') return nodes;
    return pathStr.split('.').reduce((list, i) => list[+i].children, nodes);
  }

  function onKey(e, list, i, here) {
    if (e.key === 'Enter') {
      e.preventDefault();
      list.splice(i + 1, 0, blankNode());
      onChange?.(); render([...here.slice(0, -1), i + 1]);
    } else if (e.key === 'Tab' && !e.shiftKey && i > 0) {
      e.preventDefault();
      const [moved] = list.splice(i, 1);
      list[i - 1].children.push(moved);
      onChange?.(); render([...here.slice(0, -1), i - 1, list[i - 1].children.length - 1]);
    } else if (e.key === 'Tab' && e.shiftKey && here.length > 1) {
      e.preventDefault();
      const parentPath = here.slice(0, -2);
      const parentList = parentPath.length ? listAt(parentPath.join('.')) : nodes;
      const parentIndex = here.at(-2);
      const [moved] = list.splice(i, 1);
      parentList.splice(parentIndex + 1, 0, moved);
      onChange?.(); render([...parentPath, parentIndex + 1]);
    }
  }

  render();
  return wrap;
}

const blankNode = () => ({ text: '', checked: false, children: [] });

// ---------------------------------------------------------------- rich text

const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'DIV']);

/** Strip everything we did not ask for — pasted Google Docs markup especially. */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  for (const node of [...root.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
    for (const attr of [...node.attributes]) {
      const ok = node.tagName === 'A' && attr.name === 'href'
        && /^(https?:|mailto:)/i.test(attr.value.trim());
      if (!ok) node.removeAttribute(attr.name);
    }
    if (node.tagName === 'A') { node.target = '_blank'; node.rel = 'noopener'; }
  }
  return root.innerHTML;
}

/** richText(html, { onChange, placeholder }) -> element. onChange(sanitizedHtml). */
export function richText(html, { onChange, placeholder = '' } = {}) {
  const area = el('div', {
    class: 'richtext', contentEditable: 'true', role: 'textbox',
    'aria-multiline': 'true', 'data-placeholder': placeholder,
    html: sanitizeHtml(html || ''),
    onInput: () => onChange?.(sanitizeHtml(area.innerHTML)),
    onBlur: () => { area.innerHTML = sanitizeHtml(area.innerHTML); onChange?.(area.innerHTML); },
    onPaste: e => {
      // Paste as plain text, then let the toolbar add formatting back. Google
      // Docs markup is otherwise a wall of spans and inline styles.
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    },
  });

  const cmd = (command, label, title, arg) => el('button', {
    type: 'button', class: 'rt-btn', title, 'aria-label': title,
    // mousedown, not click: click would blur the editor first and lose the selection.
    onMousedown: e => {
      e.preventDefault();
      if (command === 'createLink') {
        const url = prompt('Link to:', 'https://');
        if (!url) return;
        document.execCommand('createLink', false, url);
      } else {
        document.execCommand(command, false, arg);
      }
      onChange?.(sanitizeHtml(area.innerHTML));
    },
  }, label);

  return el('div', { class: 'richtext-wrap' },
    el('div', { class: 'rt-toolbar' },
      cmd('bold', 'B', 'Bold'),
      cmd('italic', 'I', 'Italic'),
      cmd('insertUnorderedList', '•', 'Bulleted list'),
      cmd('insertOrderedList', '1.', 'Numbered list'),
      cmd('createLink', '🔗', 'Add link'),
      cmd('removeFormat', '⌫', 'Clear formatting')),
    area);
}

// ---------------------------------------------------------------- images

/**
 * imageField(getUrl, setUrl, { upload, onChange, label })
 * upload(file) -> Promise<url>
 */
export function imageField(getUrl, setUrl, { upload, onChange, label = 'image' } = {}) {
  const wrap = el('div', { class: 'image-field' });

  function render() {
    clear(wrap);
    const url = getUrl();
    const input = el('input', { type: 'file', accept: 'image/*', hidden: true,
      onChange: async e => {
        const file = e.target.files[0];
        if (!file) return;
        status.textContent = 'Uploading…';
        try { setUrl(await upload(file)); onChange?.(); render(); }
        catch (err) { status.textContent = `Upload failed (${err.code || err.message}).`; }
      } });
    const status = el('span', { class: 'hint' });

    wrap.append(
      url ? el('img', { class: 'image-preview', src: url, alt: '' })
          : el('div', { class: 'image-empty' }, `No ${label} yet`),
      el('div', { class: 'image-tools' },
        input,
        el('button', { type: 'button', class: 'btn btn--ghost', onClick: () => input.click() },
          url ? 'Replace…' : 'Upload…'),
        el('input', { class: 'inp grow', type: 'url', value: url, placeholder: 'or paste an image URL',
          onInput: e => { setUrl(e.target.value.trim()); onChange?.(); } }),
        url ? el('button', { type: 'button', class: 'btn btn--ghost',
          onClick: () => { setUrl(''); onChange?.(); render(); } }, 'Remove') : null,
        status));
  }

  render();
  return wrap;
}

/** gallery(photos, { upload, onChange }) — [{url, caption}] */
export function gallery(photos, { upload, onChange } = {}) {
  const wrap = el('div', { class: 'field-list' });

  function render() {
    clear(wrap);
    const grid = el('div', { class: 'gallery' });

    photos.forEach((photo, i) => {
      grid.append(el('figure', { class: 'gallery-item', dataset: { index: i } },
        el('span', { class: 'grip', title: 'Drag to reorder' }, '⠿'),
        photo.url ? el('img', { src: photo.url, alt: photo.caption || '' })
                  : el('div', { class: 'image-empty' }, 'No image'),
        el('input', { class: 'inp', type: 'text', value: photo.caption, placeholder: 'Caption',
          'aria-label': 'Caption',
          onInput: e => { photo.caption = e.target.value; onChange?.(); } }),
        el('button', { type: 'button', class: 'icon-btn icon-btn--danger', title: 'Remove photo',
          onClick: () => { photos.splice(i, 1); onChange?.(); render(); } }, '✕')));
    });

    if (!photos.length) grid.append(el('div', { class: 'empty' }, 'No photos yet.'));

    sortable(grid, { group: 'gallery', listId: 'main', onMove: ({ fromIndex, toIndex }) => {
      moveItem(photos, fromIndex, toIndex); onChange?.(); render();
    } });

    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
      onChange: async e => {
        const files = [...e.target.files];
        add.textContent = `Uploading ${files.length}…`;
        for (const file of files) {
          try { photos.push({ url: await upload(file), caption: '' }); }
          catch { /* keep going; the rest may succeed */ }
        }
        add.textContent = '+ Add photos';
        onChange?.(); render();
      } });
    const add = el('button', { type: 'button', class: 'btn btn--ghost',
      onClick: () => input.click() }, '+ Add photos');

    wrap.append(grid, input, add);
  }

  render();
  return wrap;
}
