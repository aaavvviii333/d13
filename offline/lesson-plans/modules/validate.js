// modules/validate.js — the completeness meter. Pure.
//
// Blockers must clear before a plan can be published. Warnings are nudges and
// never block: gating on the "Students will be able to" stem would just teach
// staff to paste the words without meaning them.

import { countChecklist } from './schema.js';
import { layout } from './schedule.js';

const text = v => String(v ?? '').replace(/<[^>]*>/g, '').trim();
const filled = list => (list || []).filter(x => text(x)).length;

export function check(plan) {
  const blockers = [];
  const warnings = [];
  const add = (list, section, message) => list.push({ section, message });

  // --- Standard of Information: every plan has the same sections ---
  if (!text(plan.title)) add(blockers, 'title', 'Give the plan a title.');
  if (!text(plan.overview)) add(blockers, 'overview', 'Write an overview.');
  if (!text(plan.pacing?.gradeBand)) add(blockers, 'pacing', 'Set the grade band.');
  if (!filled(plan.purpose)) add(blockers, 'purpose', 'Add at least one aim.');
  if (!filled(plan.objectives)) add(blockers, 'objectives', 'Add at least one objective.');
  if (!(plan.materials?.purchasing || []).filter(r => text(r.item)).length)
    add(blockers, 'materials', 'List at least one material.');
  if (!filled(plan.assessment)) add(blockers, 'assessment', 'Add at least one way to verify learning.');
  if (!filled(plan.skillsLearned)) add(blockers, 'skillsLearned', 'List at least one skill learned.');

  // --- Standard of Depth ---
  const sched = layout(plan.schedule);
  if (!sched.flat.length) {
    add(blockers, 'schedule', 'Add at least one schedule block.');
  } else {
    const noDuration = sched.flat.filter(e => e.duration <= 0);
    if (noDuration.length)
      add(blockers, 'schedule', `${noDuration.length} block(s) have no duration: ${names(noDuration)}.`);

    const noDescription = sched.flat.filter(e => !text(e.block.description));
    if (noDescription.length)
      add(blockers, 'schedule', `${noDescription.length} block(s) have no description: ${names(noDescription)}.`);

    const noTitle = sched.flat.filter(e => !text(e.block.title));
    if (noTitle.length) add(warnings, 'schedule', `${noTitle.length} block(s) are untitled.`);

    // Procedures written as numbered steps.
    if (!sched.flat.some(e => (e.block.detailedSteps || []).filter(text).length >= 2))
      add(blockers, 'schedule',
        'At least one block needs its procedure written out as numbered steps (2 or more).');

    // Standard of Procedure: someone has to know who does what.
    if (!sched.flat.some(e => text(e.block.facilitationNote)))
      add(blockers, 'schedule', 'Add a facilitation note to at least one block (lead vs. support, station roles).');
  }

  if (sched.mismatch)
    add(warnings, 'schedule',
      `Blocks sum to ${sched.grandTotal} min but the stated total says ${sched.statedTotalMinutes} min.`);

  // --- Standard of Procedure: prep ---
  const prepCount = countChecklist(plan.classLeadPrep);
  if (prepCount < 3)
    add(blockers, 'classLeadPrep', `Prep checklist needs at least 3 items (has ${prepCount}).`);

  // --- Warnings ---
  const vague = (plan.objectives || [])
    .filter(o => text(o) && !/students will be able to/i.test(o));
  if (vague.length)
    add(warnings, 'objectives',
      `${vague.length} objective(s) don't start with "Students will be able to…" — measurable phrasing makes them checkable.`);

  if (!text(plan.heroImage)) add(warnings, 'title', 'No hero image.');
  if (!(plan.photos || []).filter(p => text(p.url)).length) add(warnings, 'photos', 'No photos yet.');
  if (!(plan.materials?.assetLinks || []).filter(l => text(l.url)).length)
    add(warnings, 'materials', 'No asset links (slides, worksheets, laser-cut kits).');
  if (!(plan.pacing?.links || []).filter(l => text(l.url)).length)
    add(warnings, 'pacing', 'No pacing links.');

  // ponytail: score is blockers-cleared over blockers-total. A percentage that
  // counts warnings would never reach 100 and staff would learn to ignore it.
  const TOTAL_CHECKS = 14;
  const score = Math.round(100 * Math.max(0, TOTAL_CHECKS - blockers.length) / TOTAL_CHECKS);

  return { blockers, warnings, score, canPublish: blockers.length === 0 };
}

function names(entries) {
  return entries.slice(0, 3).map(e => `"${text(e.block.title) || 'untitled'}"`).join(', ')
    + (entries.length > 3 ? '…' : '');
}
