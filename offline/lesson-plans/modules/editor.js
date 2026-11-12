// modules/editor.js — the guided form. Sections render in the order the data
// model declares them, because that order is the standard.

import { el, clear, stringList, rowList, checklist, richText, imageField, gallery,
         sortable, moveItem, autoGrow, growAll, iconBtn, linkColumns, blankLink } from './fields.js';
import { blankBlock, rescalePurchasing, OBJECTIVE_STEM } from './schema.js';
import { layout, formatDuration, parseDurationInput } from './schedule.js';

export const SECTIONS = [
  ['title',         'Title'],
  ['overview',      'Overview'],
  ['pacing',        'Pacing'],
  ['purpose',       'Purpose'],
  ['objectives',    'Objectives'],
  ['materials',     'Materials'],
  ['classLeadPrep', 'Class lead prep'],
  ['schedule',      'Schedule'],
  ['assessment',    'Assessment'],
  ['skillsLearned', 'Skills learned'],
  ['photos',        'Photos'],
];

function section(id, heading, hint, ...body) {
  return el('section', { class: 'card', id: `sec-${id}` },
    el('h2', {}, heading),
    hint ? el('p', { class: 'hint' }, hint) : null,
    ...body);
}

/** renderEditor(plan, { onChange, upload }) -> element */
export function renderEditor(plan, ctx) {
  const { onChange } = ctx;
  const root = el('div', { class: 'editor' });

  // 1 — title + hero image
  root.append(section('title', 'Title', 'What the lesson is called, and one photo that shows it off.',
    el('input', { class: 'inp inp--title', type: 'text', value: plan.title,
      placeholder: 'Build a Bird', 'aria-label': 'Lesson title',
      onInput: e => { plan.title = e.target.value; onChange(); } }),
    imageField(() => plan.heroImage, v => { plan.heroImage = v; },
      { upload: ctx.upload, onChange, label: 'hero image' })));

  // 2 — overview
  root.append(section('overview', 'Overview',
    'A paragraph a new staff member could read and know what the day is.',
    richText(plan.overview, {
      placeholder: 'What happens in this lesson, and why…',
      onChange: html => { plan.overview = html; onChange(); } })));

  // 3 — pacing
  root.append(section('pacing', 'Pacing', 'Where this sits in the year.',
    el('div', { class: 'grid-3' },
      labelled('Grade band', el('input', { class: 'inp', type: 'text', value: plan.pacing.gradeBand,
        placeholder: 'Grade 1',
        onInput: e => { plan.pacing.gradeBand = e.target.value; onChange(); } })),
      labelled('Curriculum unit', el('input', { class: 'inp', type: 'text', value: plan.pacing.curriculumUnit,
        placeholder: 'EL Education K-8 — Bird’s Amazing Bodies',
        onInput: e => { plan.pacing.curriculumUnit = e.target.value; onChange(); } })),
      labelled('Season / date range', el('input', { class: 'inp', type: 'text', value: plan.pacing.seasonDateRange,
        placeholder: 'February–June',
        onInput: e => { plan.pacing.seasonDateRange = e.target.value; onChange(); } }))),
    el('h3', {}, 'Links'),
    rowList(plan.pacing.links, linkColumns,
      { onChange, blank: blankLink, addLabel: 'Add link' })));

  // 4 — purpose
  root.append(section('purpose', 'Purpose', 'The aims of the lesson, in order.',
    stringList(plan.purpose, { onChange, addLabel: 'Add aim',
      placeholder: 'Supplement students’ knowledge of…' })));

  // 5 — objectives
  root.append(section('objectives', 'Objectives',
    'Measurable: if you could not watch a student do it, it is not an objective yet.',
    stringList(plan.objectives, { onChange, addLabel: 'Add objective', stem: OBJECTIVE_STEM,
      placeholder: `${OBJECTIVE_STEM}construct a simple flapping bird…` })));

  // 6 — materials
  root.append(materialsSection(plan, ctx));

  // 7 — class lead prep
  root.append(section('classLeadPrep', 'Class lead prep',
    'Everything that must be true before students walk in. Tab indents, Enter adds the next item.',
    checklist(plan.classLeadPrep, { onChange })));

  // 8 — schedule
  root.append(scheduleSection(plan, ctx));

  // 9 — assessment
  root.append(section('assessment', 'Assessment', 'How you will know they got it.',
    stringList(plan.assessment, { onChange, addLabel: 'Add method',
      placeholder: 'Observation: instructors note…' })));

  // 10 — skills learned
  root.append(section('skillsLearned', 'Skills learned', null,
    stringList(plan.skillsLearned, { onChange, addLabel: 'Add skill', multiline: false,
      placeholder: 'Basic mechanical construction' })));

  // 11 — photos
  root.append(section('photos', 'Photos', 'From the last time this ran.',
    gallery(plan.photos, { upload: ctx.upload, onChange })));

  return root;
}

function labelled(text, control) {
  return el('label', { class: 'labelled' }, el('span', {}, text), control);
}

// ---------------------------------------------------------------- materials

function materialsSection(plan, ctx) {
  const { onChange } = ctx;
  const m = plan.materials;

  // Remembered so a change to the control knows what ratio to apply.
  let lastClasses = Number(m.scaledForClasses) || 1;
  let lastStudents = Number(m.scaledForStudents) || 1;

  const purchasing = el('div');
  const renderPurchasing = () => {
    clear(purchasing).append(rowList(m.purchasing, [
      { key: 'item', label: 'Item', width: '2fr', placeholder: 'Skewers' },
      { key: 'quantity', label: 'Qty', type: 'number', width: '90px' },
      { key: 'unit', label: 'Unit', width: '140px', placeholder: 'pc' },
      { key: 'url', label: 'Link', type: 'url', width: '2fr', placeholder: 'https://…' },
    ], { onChange, addLabel: 'Add material',
         blank: () => ({ item: '', quantity: '', unit: '', url: '' }) }));
  };
  renderPurchasing();

  function scaler(label, get, set, getLast, setLast) {
    return labelled(label, el('input', { class: 'inp', type: 'number', min: '1', value: get(),
      onChange: e => {
        const next = Math.max(1, Number(e.target.value) || 1);
        const ratio = next / (getLast() || 1);
        set(next);
        e.target.value = next;
        m.purchasing = rescalePurchasing(m.purchasing, ratio);
        setLast(next);
        renderPurchasing();
        onChange();
      } }));
  }

  return section('materials', 'Materials',
    'Change the class or student count and the quantities below scale with it.',
    el('div', { class: 'grid-2 scaler' },
      scaler('Scaled for classes', () => m.scaledForClasses, v => { m.scaledForClasses = v; },
        () => lastClasses, v => { lastClasses = v; }),
      scaler('Scaled for students', () => m.scaledForStudents, v => { m.scaledForStudents = v; },
        () => lastStudents, v => { lastStudents = v; })),
    el('h3', {}, 'Asset links'),
    el('p', { class: 'hint' }, 'Slides, worksheets, laser-cut kits.'),
    rowList(m.assetLinks, linkColumns, { onChange, blank: blankLink, addLabel: 'Add asset link' }),
    el('h3', {}, 'Purchasing list'),
    purchasing);
}

// ---------------------------------------------------------------- schedule builder

function scheduleSection(plan, ctx) {
  const { onChange } = ctx;
  const s = plan.schedule;
  const body = el('div');

  // Live time labels are rebuilt from the cascade without re-rendering the form,
  // so typing in a duration box never steals your cursor.
  let timeNodes = [];
  let phaseTotalNodes = [];
  let totalNode = null;
  let mismatchNode = null;

  function refreshTimes() {
    const l = layout(s);
    l.flat.forEach((entry, i) => {
      const node = timeNodes[i];
      if (!node) return;
      node.start.textContent = entry.startLabel;
      node.end.textContent = entry.endLabel;
      node.dur.textContent = formatDuration(entry.duration);
    });
    l.phases.forEach((phase, i) => {
      if (phaseTotalNodes[i]) phaseTotalNodes[i].textContent = formatDuration(phase.total);
    });
    if (totalNode) totalNode.textContent = formatDuration(l.grandTotal);
    if (mismatchNode) {
      mismatchNode.hidden = !l.mismatch;
      if (l.mismatch) mismatchNode.textContent =
        `Blocks add up to ${formatDuration(l.grandTotal)}, but the stated total says ${formatDuration(l.statedTotalMinutes)}.`;
    }
  }

  function render() {
    clear(body);
    timeNodes = [];
    phaseTotalNodes = [];

    const l = layout(s);
    let flatIndex = 0;

    const phasesEl = el('div', { class: 'phases' });

    s.phases.forEach((phase, pi) => {
      const total = el('span', { class: 'pill' }, formatDuration(l.phases[pi]?.total ?? 0));
      phaseTotalNodes[pi] = total;

      const blocksEl = el('div', { class: 'blocks' });
      phase.blocks.forEach((block, bi) => {
        blocksEl.append(blockCard(block, pi, bi, l.flat[flatIndex]));
        flatIndex++;
      });
      if (!phase.blocks.length) blocksEl.append(el('div', { class: 'empty' }, 'Drop a block here.'));

      sortable(blocksEl, { group: 'blocks', listId: String(pi),
        onMove: ({ fromList, fromIndex, toList, toIndex }) => {
          const src = s.phases[+fromList].blocks, dst = s.phases[+toList].blocks;
          if (src === dst) moveItem(src, fromIndex, toIndex);
          else {
            const [moved] = src.splice(fromIndex, 1);
            if (!moved) return;
            dst.splice(toIndex, 0, moved);
          }
          onChange(); render();
        } });

      phasesEl.append(el('div', { class: 'phase', dataset: { index: pi } },
        el('div', { class: 'phase-head' },
          el('span', { class: 'grip', title: 'Drag to reorder phase' }, '⠿'),
          el('input', { class: 'inp inp--phase', type: 'text', value: phase.name,
            placeholder: 'Phase name (e.g. Introduction)', 'aria-label': 'Phase name',
            onInput: e => { phase.name = e.target.value; onChange(); } }),
          total,
          // Dragging a phase past several others is fiddly on a trackpad, and is
          // not reachable from the keyboard at all. These always work.
          iconBtn('↑', 'Move phase up', () => {
            if (pi > 0) { moveItem(s.phases, pi, pi - 1); onChange(); render(); } }),
          iconBtn('↓', 'Move phase down', () => {
            if (pi < s.phases.length - 1) { moveItem(s.phases, pi, pi + 1); onChange(); render(); } }),
          el('button', { type: 'button', class: 'btn btn--ghost',
            onClick: () => { phase.blocks.push(blankBlock()); onChange(); render(); } }, '+ Block'),
          el('button', { type: 'button', class: 'icon-btn icon-btn--danger', title: 'Remove phase',
            onClick: () => {
              if (phase.blocks.length && !confirm(`Remove "${phase.name || 'this phase'}" and its ${phase.blocks.length} block(s)?`)) return;
              s.phases.splice(pi, 1); onChange(); render();
            } }, '✕')),
        blocksEl));
    });

    if (!s.phases.length) phasesEl.append(el('div', { class: 'empty' },
      'No phases yet. Add one to start the run-of-show.'));

    sortable(phasesEl, { group: 'phases', listId: 'main', onMove: ({ fromIndex, toIndex }) => {
      moveItem(s.phases, fromIndex, toIndex); onChange(); render();
    } });

    totalNode = el('strong', {}, formatDuration(l.grandTotal));
    mismatchNode = el('p', { class: 'warn-banner', hidden: !l.mismatch });

    body.append(
      el('div', { class: 'grid-2 anchor-row' },
        labelled('Start time (optional)', el('input', { class: 'inp', type: 'time',
          value: s.startAnchor || '',
          onInput: e => { s.startAnchor = e.target.value; onChange(); refreshTimes(); } })),
        labelled('Stated total (optional)', el('input', { class: 'inp', type: 'text',
          value: s.statedTotalMinutes == null ? '' : formatDuration(s.statedTotalMinutes),
          placeholder: 'e.g. 3h or 3:05',
          onChange: e => {
            s.statedTotalMinutes = parseDurationInput(e.target.value);
            e.target.value = s.statedTotalMinutes == null ? '' : formatDuration(s.statedTotalMinutes);
            onChange(); refreshTimes();
          } }))),
      el('p', { class: 'hint' }, s.startAnchor
        ? 'Start and end times below are computed from the start time. Reorder a block and they all shift.'
        : 'No start time set, so blocks show elapsed time from the beginning.'),
      phasesEl,
      el('div', { class: 'schedule-foot' },
        el('button', { type: 'button', class: 'btn btn--ghost',
          onClick: () => { s.phases.push({ name: '', blocks: [blankBlock()] }); onChange(); render(); } },
          '+ Add phase'),
        el('span', { class: 'total' }, 'Total time: ', totalNode)),
      mismatchNode);

    refreshTimes();
  }

  /** Step a block one place, hopping into the neighbouring phase at the edges. */
  function moveBlock(pi, bi, delta) {
    const blocks = s.phases[pi].blocks;
    const next = bi + delta;
    if (next >= 0 && next < blocks.length) {
      moveItem(blocks, bi, next);
    } else {
      const intoPhase = pi + delta;
      if (intoPhase < 0 || intoPhase >= s.phases.length) return;
      const [moved] = blocks.splice(bi, 1);
      const target = s.phases[intoPhase].blocks;
      target.splice(delta < 0 ? target.length : 0, 0, moved);
    }
    onChange();
    render();
  }

  function blockCard(block, pi, bi, entry) {
    const start = el('span', { class: 'time-start' }, entry?.startLabel ?? '');
    const end = el('span', { class: 'time-end' }, entry?.endLabel ?? '');
    const dur = el('span', { class: 'pill pill--quiet' }, formatDuration(block.duration || 0));
    timeNodes.push({ start, end, dur });

    const stepsWrap = el('div');
    const renderSteps = () => {
      clear(stepsWrap).append(stringList(block.detailedSteps, {
        onChange, addLabel: 'Add step', placeholder: 'Fold the body and insert a skewer handle…' }));
    };
    renderSteps();

    return el('div', { class: 'block', dataset: { index: bi } },
      el('div', { class: 'block-head' },
        el('span', { class: 'grip', title: 'Drag to reorder or move to another phase' }, '⠿'),
        el('span', { class: 'times' }, start, ' – ', end),
        el('input', { class: 'inp grow', type: 'text', value: block.title,
          placeholder: 'Block title', 'aria-label': 'Block title',
          onInput: e => { block.title = e.target.value; onChange(); } }),
        el('input', { class: 'inp inp--dur', type: 'number', min: '0', step: '5',
          value: block.duration, 'aria-label': 'Duration in minutes',
          onInput: e => {
            block.duration = Math.max(0, Number(e.target.value) || 0);
            onChange(); refreshTimes();
          } }),
        el('span', { class: 'unit' }, 'min'),
        dur,
        iconBtn('↑', 'Move block up', () => moveBlock(pi, bi, -1)),
        iconBtn('↓', 'Move block down', () => moveBlock(pi, bi, +1)),
        el('button', { type: 'button', class: 'icon-btn icon-btn--danger', title: 'Remove block',
          onClick: () => { s.phases[pi].blocks.splice(bi, 1); onChange(); render(); } }, '✕')),

      el('textarea', { class: 'inp', rows: 2, value: block.description,
        placeholder: 'What happens in this block…', 'aria-label': 'Block description',
        onInput: e => { block.description = e.target.value; autoGrow(e.target); onChange(); } }),

      details(`Numbered steps${block.detailedSteps.length ? ` (${block.detailedSteps.length})` : ''}`,
        block.detailedSteps.length > 0, stepsWrap),

      details(`Facilitation note${block.facilitationNote ? '' : ''}`,
        !!block.facilitationNote,
        el('textarea', { class: 'inp', rows: 2, value: block.facilitationNote,
          placeholder: 'Who leads, who supports, what the station leads watch for…',
          'aria-label': 'Facilitation note',
          onInput: e => { block.facilitationNote = e.target.value; autoGrow(e.target); onChange(); } })));
  }

  function details(summary, open, ...body) {
    // A textarea inside a closed <details> has no layout, so it cannot size
    // itself until the disclosure opens.
    const node = el('details', { class: 'block-details', open },
      el('summary', {}, summary), ...body);
    node.addEventListener('toggle', () => { if (node.open) growAll(node); });
    return node;
  }

  render();
  return section('schedule', 'Schedule',
    'The run-of-show. Every block needs a duration and a description.', body);
}
