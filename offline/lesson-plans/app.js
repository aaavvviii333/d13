// app.js — routing, the plan list, and the editor shell (save, attribution,
// version history, completeness meter).

import * as store from './modules/store.js';
import { normalize, blankPlan, STATUS } from './modules/schema.js';
import { check } from './modules/validate.js';
import { renderEditor, SECTIONS } from './modules/editor.js';
import { el, clear, growAll } from './modules/fields.js';

const view = document.getElementById('view');
const DRAFT_PREFIX = 'lessonPlansDraft:';

// ---------------------------------------------------------------- boot

window.addEventListener('hashchange', route);
route();

async function route() {
  if (!(await gate())) return;
  const m = /^#\/plan\/(.+)$/.exec(location.hash);
  if (m) return openPlan(decodeURIComponent(m[1]));
  return openList();
}

/** Ask for a name, and for the shared key if a backend is configured. */
async function gate() {
  if (store.getWho() && (!store.configured() || store.getKey())) return true;

  const name = el('input', { class: 'inp', type: 'text', value: store.getWho(),
    placeholder: 'e.g. Avi G.', 'aria-label': 'Your name', autocomplete: 'name' });
  const key = el('input', { class: 'inp', type: 'password', placeholder: 'Shared key',
    'aria-label': 'Shared key', autocomplete: 'current-password' });
  const error = el('p', { class: 'warn-banner', hidden: true });
  const go = el('button', { class: 'btn btn--primary', type: 'submit' }, 'Continue');

  const form = el('form', { class: 'card gate', onSubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return; }
    go.disabled = true;
    try {
      if (store.configured()) {
        if (!await store.verifyKey(key.value.trim())) {
          error.hidden = false; error.textContent = 'That key is not right.';
          go.disabled = false; key.select(); return;
        }
      }
      store.setWho(name.value.trim());
      route();
    } catch (err) {
      error.hidden = false;
      error.textContent = describe(err);
      go.disabled = false;
    }
  } },
    el('h2', {}, 'Lesson Plans'),
    el('p', { class: 'hint' },
      'Your name goes on everything you save, so other staff know who to ask.'),
    el('label', { class: 'labelled' }, el('span', {}, 'Your name'), name),
    store.configured()
      ? el('label', { class: 'labelled' }, el('span', {}, 'Shared key'), key)
      : el('p', { class: 'hint' },
          'No backend is configured yet, so plans save to this browser only. See docs/apps-script.gs.'),
    error, go);

  clear(view).append(el('div', { class: 'narrow' }, form));
  name.focus();
  return false;
}

// ---------------------------------------------------------------- list

async function openList() {
  clear(view).append(el('p', { class: 'loading' }, 'Loading plans…'));

  let plans;
  try { plans = await store.list(); }
  catch (err) { return clear(view).append(errorCard(err, openList)); }

  plans.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const rows = plans.map(p => el('a', { class: 'plan-row', href: `#/plan/${encodeURIComponent(p.id)}` },
    el('span', { class: 'plan-title' }, p.title || '(untitled)'),
    el('span', { class: `badge badge--${p.status}` }, p.status),
    el('span', { class: 'plan-meta' },
      p.updatedBy ? `Last edited by ${p.updatedBy}` : 'Never edited',
      p.updatedAt ? ` on ${formatDate(p.updatedAt)}` : ''),
    el('span', { class: 'plan-actions' },
      el('button', { type: 'button', class: 'btn btn--ghost', title: 'Duplicate as a new plan',
        onClick: e => { e.preventDefault(); duplicate(p.id); } }, 'Duplicate'),
      el('button', { type: 'button', class: 'icon-btn icon-btn--danger', title: 'Delete plan',
        onClick: async e => {
          e.preventDefault();
          if (!confirm(`Delete "${p.title}"? Its version history is kept.`)) return;
          try { await store.remove(p.id); openList(); }
          catch (err) { alert(describe(err)); }
        } }, '✕'))));

  clear(view).append(
    el('div', { class: 'toolbar' },
      el('h1', {}, 'Lesson Plans'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--ghost', onClick: importSeed },
        'Import the Build a Bird example'),
      el('button', { class: 'btn btn--ghost', onClick: importJSON }, 'Import JSON'),
      el('button', { class: 'btn btn--primary', onClick: newPlan }, '+ New plan')),
    el('div', { class: 'plan-list' },
      rows.length ? rows : el('div', { class: 'empty' }, 'No plans yet. Make the first one.')));
}

/** Save a brand-new plan and open it. */
async function createAndOpen(plan) {
  try {
    await store.save(plan, 0);
    location.hash = `#/plan/${encodeURIComponent(plan.id)}`;
  } catch (err) { alert(describe(err)); }
}

// Bound to a click, so it must ignore the event it is handed.
function newPlan() { return createAndOpen(blankPlan(store.getWho())); }

async function duplicate(id) {
  try {
    const { plan } = await store.get(id);
    const copy = normalize(plan);
    copy.id = crypto.randomUUID();
    copy.title = `${copy.title} (copy)`;
    copy.metadata = { ...copy.metadata, author: store.getWho(), editors: [],
      createdAt: new Date().toISOString(), status: STATUS.DRAFT, version: 0 };
    await createAndOpen(copy);
  } catch (err) { alert(describe(err)); }
}

/**
 * Paste a plan as JSON — the output of the NotebookLM prompt in
 * docs/notebooklm-prompt.md. normalize() fills in whatever the paste is
 * missing, so a partial draft still opens in the editor with its gaps visible.
 */
async function importJSON() {
  // ponytail: prompt() is ugly but it is one line and cannot lose the paste to
  // a half-built modal. A drop zone when staff start importing in batches.
  const raw = prompt('Paste the lesson plan JSON:');
  if (!raw || !raw.trim()) return;
  let parsed;
  try {
    // Tolerate a ```json fence, since that is how a chat assistant returns it.
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch (err) {
    return alert(`That is not valid JSON: ${err.message}`);
  }
  const plan = normalize(parsed);
  plan.id = crypto.randomUUID();
  plan.metadata = { ...plan.metadata, author: store.getWho(), editors: [],
    createdAt: new Date().toISOString(), status: STATUS.DRAFT, version: 0 };
  await createAndOpen(plan);
}

async function importSeed() {
  try {
    const seed = normalize(await (await fetch('seed/build-a-bird.json')).json());
    seed.id = crypto.randomUUID();
    seed.metadata.version = 0;
    seed.metadata.editors = [];
    await createAndOpen(seed);
  } catch (err) { alert(`Could not load the example: ${err.message}`); }
}

// ---------------------------------------------------------------- editor

async function openPlan(id) {
  clear(view).append(el('p', { class: 'loading' }, 'Loading…'));

  let loaded;
  try { loaded = await store.get(id); }
  catch (err) { return clear(view).append(errorCard(err, () => openPlan(id))); }

  let plan = normalize(loaded.plan);
  let baseVersion = loaded.version;
  let dirty = false;

  // A local draft survives a closed tab or a failed save. It is only offered if
  // it is newer than what the server last gave us.
  const draftKey = DRAFT_PREFIX + id;
  const draft = readDraft(draftKey);
  if (draft && draft.baseVersion === baseVersion &&
      confirm('You have unsaved changes to this plan from earlier. Restore them?')) {
    plan = normalize(draft.plan);
    dirty = true;
  } else if (draft) {
    localStorage.removeItem(draftKey);
  }

  const status = el('span', { class: 'save-status' });
  const meter = el('aside', { class: 'meter' });
  const publishToggle = el('button', { type: 'button', class: 'btn', id: 'publish-toggle' });
  const saveBtn = el('button', { type: 'button', class: 'btn btn--primary', onClick: () => save() }, 'Save');

  const onChange = debounce(() => {
    dirty = true;
    status.textContent = 'Unsaved changes';
    status.className = 'save-status save-status--dirty';
    writeDraft(draftKey, { baseVersion, plan });
    renderMeter();
  }, 150);

  function renderMeter() {
    const r = check(plan);
    clear(meter).append(...[
      el('div', { class: 'meter-head' },
        el('div', { class: 'meter-bar' },
          el('div', { class: 'meter-fill', style: `width:${r.score}%`,
            'data-ok': r.canPublish ? 'yes' : 'no' })),
        el('strong', {}, `${r.score}%`)),
      el('p', { class: 'hint' }, r.canPublish
        ? 'Meets the D13 standard. Ready to publish.'
        : `${r.blockers.length} thing(s) to fix before publishing.`),
      // A published plan edited back below the bar stays published — blocking the
      // save would lose work. Say so instead.
      !r.canPublish && plan.metadata.status === STATUS.PUBLISHED
        ? el('p', { class: 'warn-banner' }, 'This plan is published but no longer meets the standard.')
        : null,
      list('Required', r.blockers, 'blocker'),
      list('Suggestions', r.warnings, 'warning'),
    ].filter(Boolean));

    publishToggle.textContent = plan.metadata.status === STATUS.PUBLISHED
      ? 'Unpublish' : 'Publish';
    publishToggle.className = `btn ${plan.metadata.status === STATUS.PUBLISHED ? 'btn--ghost' : 'btn--accent'}`;
    publishToggle.disabled = plan.metadata.status !== STATUS.PUBLISHED && !r.canPublish;
    publishToggle.title = publishToggle.disabled
      ? 'Clear the required items first' : '';
  }

  function list(heading, items, kind) {
    if (!items.length) return null;
    return el('div', { class: `meter-group meter-group--${kind}` },
      el('h3', {}, heading),
      el('ul', {}, items.map(item => el('li', {},
        el('a', { href: `#sec-${item.section}`,
          onClick: e => {
            e.preventDefault();
            document.getElementById(`sec-${item.section}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } }, sectionLabel(item.section)),
        ' — ', item.message))));
  }

  async function save({ force = false } = {}) {
    saveBtn.disabled = true;
    status.textContent = 'Saving…';
    status.className = 'save-status';
    try {
      const res = await store.save(plan, baseVersion, force);
      plan = normalize(res.plan);
      baseVersion = res.version;
      dirty = false;
      localStorage.removeItem(draftKey);
      status.textContent = `Saved · v${baseVersion}`;
      status.className = 'save-status save-status--ok';
      renderAttribution();
      renderMeter();
    } catch (err) {
      if (err.code === 'conflict') {
        const who = err.detail.currentBy || 'someone else';
        status.textContent = 'Not saved';
        status.className = 'save-status save-status--dirty';
        if (confirm(`${who} saved this plan while you were editing (now v${err.detail.current}).\n\n` +
                    `OK = overwrite their version with yours (theirs is kept in history).\n` +
                    `Cancel = leave yours unsaved so you can copy anything you need.`)) {
          saveBtn.disabled = false;
          return save({ force: true });
        }
      } else {
        status.textContent = describe(err);
        status.className = 'save-status save-status--dirty';
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  publishToggle.addEventListener('click', () => {
    plan.metadata.status = plan.metadata.status === STATUS.PUBLISHED ? STATUS.DRAFT : STATUS.PUBLISHED;
    renderMeter();
    save();
  });

  const attribution = el('p', { class: 'attribution' });
  function renderAttribution() {
    clear(attribution).append(
      plan.metadata.updatedBy || plan.metadata.author
        ? `Last edited by ${plan.metadata.updatedBy || plan.metadata.author} on ${formatDate(plan.metadata.updatedAt)}`
        : 'Not saved yet',
      ` · v${baseVersion}`,
      plan.metadata.author ? ` · created by ${plan.metadata.author}` : '',
      plan.metadata.editors.length > 1
        ? ` · editors: ${plan.metadata.editors.join(', ')}` : '');
  }
  renderAttribution();

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  clear(view).append(
    el('div', { class: 'toolbar' },
      el('a', { class: 'btn btn--ghost', href: '#/' }, '← All plans'),
      el('span', { class: 'spacer' }),
      status,
      el('button', { type: 'button', class: 'btn btn--ghost',
        onClick: () => showVersions(id, plan, applyRestored) }, 'History'),
      el('button', { type: 'button', class: 'btn btn--ghost', onClick: () => window.print() }, 'Print'),
      publishToggle,
      saveBtn),
    attribution,
    el('div', { class: 'editor-layout' },
      el('div', { class: 'editor-main' }, renderEditor(plan, { onChange, upload: store.uploadImage })),
      meter));

  renderMeter();
  growAll(view);

  function applyRestored(restored) {
    plan = normalize(restored);
    plan.id = id;
    dirty = true;
    clear(view.querySelector('.editor-main'))
      .append(renderEditor(plan, { onChange, upload: store.uploadImage }));
    renderMeter();
    growAll(view);
    status.textContent = 'Restored — not saved yet';
    status.className = 'save-status save-status--dirty';
  }
}

// ---------------------------------------------------------------- version history

async function showVersions(id, current, onRestore) {
  const body = el('div', {}, el('p', { class: 'loading' }, 'Loading history…'));
  const dialog = el('dialog', { class: 'drawer' },
    el('div', { class: 'drawer-head' },
      el('h2', {}, 'Version history'),
      el('button', { type: 'button', class: 'btn btn--ghost',
        onClick: () => dialog.close() }, 'Close')),
    body);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();

  let versions;
  try { versions = await store.versions(id); }
  catch (err) { return clear(body).append(errorCard(err)); }

  clear(body).append(
    el('p', { class: 'hint' },
      `Current is v${current.metadata.version}. Restoring puts an old version back into the ` +
      `editor; nothing is overwritten until you save.`),
    versions.length
      ? el('ul', { class: 'version-list' }, versions.map(v => el('li', {},
          el('span', {}, `v${v.version}`),
          el('span', { class: 'plan-meta' }, `${v.savedBy || 'unknown'} · ${formatDate(v.savedAt)}`),
          el('button', { type: 'button', class: 'btn btn--ghost', onClick: async () => {
            try {
              const plan = await store.version(id, v.version);
              dialog.close();
              onRestore(plan);
            } catch (err) { alert(describe(err)); }
          } }, 'Restore'))))
      : el('div', { class: 'empty' }, 'No earlier versions yet.'));
}

// ---------------------------------------------------------------- odds and ends

function errorCard(err, retry) {
  return el('div', { class: 'card' },
    el('h2', {}, 'Could not reach the plans'),
    el('p', {}, describe(err)),
    err.code === 'bad-key'
      ? el('button', { class: 'btn btn--primary',
          onClick: () => { store.clearKey(); route(); } }, 'Re-enter the key')
      : retry ? el('button', { class: 'btn btn--primary', onClick: retry }, 'Try again') : null);
}

function describe(err) {
  switch (err?.code) {
    case 'offline':    return 'No connection to the plan store. Check your network and try again.';
    case 'bad-key':    return 'The shared key is not right.';
    case 'not-found':  return 'That plan no longer exists.';
    case 'too-large':  return `This plan is too big for one sheet cell (${err.detail.size} of ${err.detail.max} characters). Trim some text or move long content to a linked doc.`;
    case 'conflict':   return 'Someone else saved this plan first.';
    case 'bad-image':  return 'That file is not an image we can read.';
    case 'http':       return `The server answered ${err.detail.status}.`;
    default:           return err?.detail?.message || err?.message || 'Something went wrong.';
  }
}

function sectionLabel(id) {
  return SECTIONS.find(([key]) => key === id)?.[1] || id;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function readDraft(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeDraft(key, value) {
  // ponytail: a plan that will not fit in localStorage is already too big for
  // the sheet; the save path reports that properly, so just skip the draft.
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}
