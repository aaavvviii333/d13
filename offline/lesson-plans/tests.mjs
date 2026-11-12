// tests.js — run with: node offline/lesson-plans/tests.mjs
// ponytail: asserts, no framework. Covers the cascade, totals, scaling and the
// completeness rules — the only non-obvious logic in the app.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, parseTime, formatClock, formatOffset, parseDurationInput } from './modules/schedule.js';
import { normalize, rescalePurchasing, countChecklist, blankPlan } from './modules/schema.js';
import { check } from './modules/validate.js';

const seed = normalize(JSON.parse(
  readFileSync(new URL('./seed/build-a-bird.json', import.meta.url), 'utf8')));

let ran = 0;
const test = (name, fn) => { fn(); ran++; process.stdout.write(`  ok  ${name}\n`); };

const sched = (anchor, ...phases) => ({
  startAnchor: anchor, statedTotalMinutes: null,
  phases: phases.map(([name, ...blocks]) => ({
    name, blocks: blocks.map(([title, duration]) => ({ title, duration, description: 'x' })),
  })),
});

// ---------------------------------------------------------------- cascade
test('anchor 13:00, 15m then 10m -> 1:00-1:15, 1:15-1:25', () => {
  const l = layout(sched('13:00', ['P', ['A', 15], ['B', 10]]));
  assert.equal(l.flat[0].startLabel, '1:00 PM');
  assert.equal(l.flat[0].endLabel,   '1:15 PM');
  assert.equal(l.flat[1].startLabel, '1:15 PM');
  assert.equal(l.flat[1].endLabel,   '1:25 PM');
});

test('changing the anchor shifts everything, durations unchanged', () => {
  const s = sched('13:00', ['P', ['A', 15], ['B', 10]]);
  s.startAnchor = '11:00';
  const l = layout(s);
  assert.deepEqual(l.flat.map(e => e.startLabel), ['11:00 AM', '11:15 AM']);
  assert.deepEqual(l.flat.map(e => e.duration), [15, 10]);
  assert.equal(l.grandTotal, 25);
});

test('dragging B above A recomputes times in the new order', () => {
  const s = sched('11:00', ['P', ['A', 15], ['B', 10]]);
  const [a, b] = s.phases[0].blocks;
  s.phases[0].blocks = [b, a];
  const l = layout(s);
  assert.deepEqual(l.flat.map(e => [e.block.title, e.startLabel, e.endLabel]), [
    ['B', '11:00 AM', '11:10 AM'],
    ['A', '11:10 AM', '11:25 AM'],
  ]);
});

test('editing a mid-schedule duration shifts only what follows', () => {
  const s = sched('09:00', ['P', ['A', 10], ['B', 20], ['C', 10]]);
  const before = layout(s).flat.map(e => e.startLabel);
  s.phases[0].blocks[1].duration = 30;
  const after = layout(s).flat.map(e => e.startLabel);
  assert.equal(after[0], before[0]);          // A unmoved
  assert.equal(after[1], before[1]);          // B unmoved
  assert.notEqual(after[2], before[2]);       // C pushed
  assert.equal(after[2], '9:40 AM');
});

test('no anchor -> elapsed offsets', () => {
  const l = layout(sched('', ['P', ['A', 15], ['B', 10]]));
  assert.equal(l.anchor, null);
  assert.deepEqual(l.flat.map(e => `${e.startLabel}-${e.endLabel}`), ['0:00-0:15', '0:15-0:25']);
});

test('times wrap past midnight instead of going to 25:00', () => {
  const l = layout(sched('23:30', ['P', ['A', 45]]));
  assert.equal(l.flat[0].startLabel, '11:30 PM');
  assert.equal(l.flat[0].endLabel,   '12:15 AM');
});

test('blocks cascade across phase boundaries', () => {
  const l = layout(sched('09:00', ['One', ['A', 30]], ['Two', ['B', 15]]));
  assert.equal(l.flat[1].startLabel, '9:30 AM');
});

// ---------------------------------------------------------------- totals
test('phase subtotals and grand total sum', () => {
  const l = layout(sched('09:00', ['One', ['A', 30], ['B', 10]], ['Two', ['C', 15]]));
  assert.deepEqual(l.phases.map(p => p.total), [40, 15]);
  assert.equal(l.grandTotal, 55);
});

test('stated total 180 vs blocks 185 flags a mismatch', () => {
  const s = sched('09:00', ['P', ['A', 120], ['B', 65]]);
  s.statedTotalMinutes = 180;
  assert.equal(layout(s).mismatch, true);
  s.statedTotalMinutes = 185;
  assert.equal(layout(s).mismatch, false);
  s.statedTotalMinutes = null;
  assert.equal(layout(s).mismatch, false);
});

test('seed plan totals 2h 55m, 9:00 AM to 11:55 AM', () => {
  const l = layout(seed.schedule);
  assert.equal(l.grandTotal, 175);
  assert.equal(l.flat[0].startLabel, '9:00 AM');
  assert.equal(l.flat.at(-1).endLabel, '11:55 AM');
});

test('duration input parsing', () => {
  assert.equal(parseDurationInput('185'), 185);
  assert.equal(parseDurationInput('3:05'), 185);
  assert.equal(parseDurationInput('3h 5m'), 185);
  assert.equal(parseDurationInput('3h'), 180);
  assert.equal(parseDurationInput(''), null);
  assert.equal(parseDurationInput('soon'), null);
});

test('time parsing rejects garbage', () => {
  assert.equal(parseTime('9:00'), 540);
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('9:75'), null);
  assert.equal(parseTime(''), null);
  assert.equal(formatClock(0), '12:00 AM');
  assert.equal(formatClock(720), '12:00 PM');
  assert.equal(formatOffset(0), '0:00');
});

// ---------------------------------------------------------------- materials
test('scaling 30 -> 60 students doubles quantities, rounding up', () => {
  const rows = [
    { item: 'Skewers', quantity: 30, unit: 'pc', url: '' },
    { item: 'Staplers', quantity: 5, unit: 'pc', url: '' },
    { item: 'Tape', quantity: 'as needed', unit: '', url: '' },
  ];
  const out = rescalePurchasing(rows, 60 / 30);
  assert.equal(out[0].quantity, 60);
  assert.equal(out[1].quantity, 10);
  assert.equal(out[2].quantity, 'as needed');   // untouched
});

test('scaling rounds up rather than short', () => {
  assert.equal(rescalePurchasing([{ item: 'x', quantity: 5 }], 1.5)[0].quantity, 8);
  assert.equal(rescalePurchasing([{ item: 'x', quantity: 30 }], 1)[0].quantity, 30);
  assert.equal(rescalePurchasing([{ item: 'x', quantity: 30 }], 0)[0].quantity, 30);
});

// ---------------------------------------------------------------- checklist
test('nested prep items all count', () => {
  assert.equal(countChecklist(seed.classLeadPrep), 18);
  assert.equal(countChecklist([]), 0);
});

// ---------------------------------------------------------------- validation
test('the seed plan is publishable', () => {
  const r = check(seed);
  assert.deepEqual(r.blockers, [], JSON.stringify(r.blockers, null, 2));
  assert.equal(r.canPublish, true);
  assert.equal(r.score, 100);
});

test('a blank plan is not publishable and scores low', () => {
  const r = check(normalize(blankPlan('Someone')));
  assert.equal(r.canPublish, false);
  assert.ok(r.blockers.length >= 9, `only ${r.blockers.length} blockers`);
  assert.ok(r.score < 40);
});

test('a block missing a description blocks publishing', () => {
  const p = structuredClone(seed);
  p.schedule.phases[0].blocks[0].description = '';
  const r = check(p);
  assert.equal(r.canPublish, false);
  assert.ok(r.blockers.some(b => b.section === 'schedule' && /no description/.test(b.message)));
});

test('a block with zero duration blocks publishing', () => {
  const p = structuredClone(seed);
  p.schedule.phases[0].blocks[1].duration = 0;
  assert.ok(check(p).blockers.some(b => /no duration/.test(b.message)));
});

test('no numbered steps anywhere blocks publishing', () => {
  const p = structuredClone(seed);
  for (const ph of p.schedule.phases) for (const b of ph.blocks) b.detailedSteps = [];
  assert.ok(check(p).blockers.some(b => /numbered steps/.test(b.message)));
});

test('no facilitation note anywhere blocks publishing', () => {
  const p = structuredClone(seed);
  for (const ph of p.schedule.phases) for (const b of ph.blocks) b.facilitationNote = '';
  assert.ok(check(p).blockers.some(b => /facilitation note/.test(b.message)));
});

test('a thin prep checklist blocks publishing', () => {
  const p = structuredClone(seed);
  p.classLeadPrep = [{ text: 'one thing', checked: false, children: [] }];
  assert.ok(check(p).blockers.some(b => b.section === 'classLeadPrep'));
});

test('un-measurable objective warns but never blocks', () => {
  const p = structuredClone(seed);
  p.objectives[0] = 'Learn about birds';
  const r = check(p);
  assert.equal(r.canPublish, true);
  assert.ok(r.warnings.some(w => w.section === 'objectives'));
});

test('an overview of only empty markup counts as missing', () => {
  const p = structuredClone(seed);
  p.overview = '<p><br></p>';
  assert.ok(check(p).blockers.some(b => b.section === 'overview'));
});

// ---------------------------------------------------------------- schema
test('normalize fills a sparse record without throwing', () => {
  const p = normalize({ title: 'Bare', schedule: { phases: [{ name: 'P' }] } });
  assert.equal(p.schedule.phases[0].blocks.length, 0);
  assert.deepEqual(p.purpose, []);
  assert.equal(p.metadata.status, 'draft');
  assert.deepEqual(normalize(null).objectives, []);
  assert.deepEqual(normalize({ photos: ['a.jpg'] }).photos, [{ url: 'a.jpg', caption: '' }]);
});

// ------------------------------------------------- NotebookLM prompt contract
// docs/notebooklm-prompt.md tells staff exactly which fields to fill. If that
// checklist and validate.js ever drift apart, staff get a "complete" draft the
// tool refuses to publish. This fixture is the prompt's checklist, in JSON.
test('a plan meeting the NotebookLM prompt checklist can publish', () => {
  const p = normalize({
    title: 'Paper Circuits',
    overview: 'Students light an LED on a folded card using copper tape.',
    pacing: { gradeBand: '3-5' },
    purpose: ['Introduce a closed circuit as something you can hold.'],
    objectives: ['Students will be able to close a circuit so the LED lights.'],
    materials: { purchasing: [{ item: 'Copper tape', quantity: 4, unit: 'roll' }] },
    classLeadPrep: [
      { text: 'Cut cardstock to 5x7' }, { text: 'Test one LED per pack' },
      { text: 'Set out a battery at each seat' },
    ],
    schedule: { phases: [{ name: 'Lesson', blocks: [{
      title: 'Build', duration: 25, description: 'Students tape the circuit.',
      detailedSteps: ['Fold the card', 'Lay tape from battery to LED'],
      facilitationNote: 'Lead demos; support circulates to the far table.',
    }] }] },
    assessment: ['The LED lights when the card is closed.'],
    skillsLearned: ['Tracing a circuit path'],
  });
  const r = check(p);
  assert.deepEqual(r.blockers, [], 'prompt checklist left a blocker unmet');
  assert.equal(r.score, 100);
  // The prompt tells staff to add photos and a hero image later, so those warn.
  assert.deepEqual(r.warnings.map(w => w.section).sort(),
    ['materials', 'pacing', 'photos', 'title']);
});

console.log(`\n${ran} passed\n`);
