// browser-tests.mjs — end-to-end checks against a running local server.
//
//   npm run serve                      # in one terminal
//   node offline/lesson-plans/browser-tests.mjs
//
// Uses whatever Playwright is already on the machine and skips politely if
// there is none, so it never becomes a dependency of the repo.
// The pure logic lives in tests.mjs and needs nothing but node.

const URL = process.env.LESSON_PLANS_URL || 'http://127.0.0.1:8787/d13-app/offline/lesson-plans/lesson-plans';

try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(res.status);
} catch {
  console.log(`skipped: nothing serving ${URL}. Run \`npm run serve\` first.`);
  process.exit(0);
}

const nodeFs = await import('node:fs');
const nodeOs = await import('node:os');

let chromium;
for (const where of [
  'playwright',
  '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs',
  '/opt/homebrew/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs',
]) {
  try { ({ chromium } = await import(where)); break; } catch { /* keep looking */ }
}
if (!chromium) {
  console.log('skipped: no Playwright on this machine (`npm i -g playwright`).');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  // A globally installed Playwright often pins a browser build number that is
  // not the one actually downloaded. Point it at whatever is in the cache.
  const exe = findChromium();
  if (!exe) { console.log(`skipped: ${err.message.split('\n')[0]}`); process.exit(0); }
  browser = await chromium.launch({ executablePath: exe });
}

function findChromium() {
  const { readdirSync, statSync } = nodeFs;
  const roots = [
    `${nodeOs.homedir()}/Library/Caches/ms-playwright`,
    `${nodeOs.homedir()}/.cache/ms-playwright`,
  ];
  for (const root of roots) {
    let builds;
    try { builds = readdirSync(root).filter(d => d.startsWith('chromium-')).sort().reverse(); }
    catch { continue; }
    for (const build of builds) {
      for (const rel of [
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-linux/chrome',
      ]) {
        const path = `${root}/${build}/${rel}`;
        try { statSync(path); return path; } catch { /* next */ }
      }
    }
  }
  return null;
}

const errors = [];
let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); }
};
const watch = page => {
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
};

/** A fresh browser context, so each suite starts with an empty local store. */
const session = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  watch(page);
  page.on('dialog', d => d.accept());
  return { ctx, page };
};


// ---------------------------------------------------------------- the basics

{
  const { ctx, page } = await session();
  await page.goto(URL);

  await step('gate appears', async () => {
    await page.waitForSelector('.gate h2');
    if (!(await page.locator('.gate').textContent()).includes('No backend is configured'))
      throw new Error('expected the local-only notice');
  });

  await step('sign in with a name', async () => {
    await page.fill('.gate input[aria-label="Your name"]', 'Test Person');
    await page.click('.gate button[type=submit]');
    await page.waitForSelector('.plan-list');
  });

  await step('empty list shows a prompt', async () => {
    await page.waitForSelector('.plan-list .empty');
  });

  await step('import the Build a Bird example', async () => {
    await page.click('text=Import the Build a Bird example');
    await page.waitForSelector('.editor', { timeout: 10000 });
    const title = await page.inputValue('.inp--title');
    if (title !== 'Build a Bird') throw new Error(`title was "${title}"`);
  });

  await step('every section rendered in order', async () => {
    const ids = await page.$$eval('.editor > section', ns => ns.map(n => n.id));
    const want = ['sec-title','sec-overview','sec-pacing','sec-purpose','sec-objectives',
      'sec-materials','sec-classLeadPrep','sec-schedule','sec-assessment','sec-skillsLearned','sec-photos'];
    if (JSON.stringify(ids) !== JSON.stringify(want))
      throw new Error(`got ${JSON.stringify(ids)}`);
  });

  await step('times cascade from the 9:00 anchor', async () => {
    const times = await page.$$eval('#sec-schedule .times', ns => ns.map(n => n.textContent.trim()));
    if (times[0] !== '9:00 AM – 9:10 AM') throw new Error(`first block: ${times[0]}`);
    if (times[1] !== '9:10 AM – 9:30 AM') throw new Error(`second block: ${times[1]}`);
    if (times.at(-1) !== '11:05 AM – 11:55 AM') throw new Error(`last block: ${times.at(-1)}`);
    const total = await page.textContent('#sec-schedule .total');
    if (!total.includes('2h 55m')) throw new Error(`total: ${total}`);
  });

  await step('meter says the seed plan is publishable', async () => {
    const txt = await page.textContent('.meter');
    if (!txt.includes('Meets the D13 standard')) throw new Error(txt.slice(0, 120));
    if (await page.textContent('#publish-toggle') !== 'Unpublish')
      throw new Error('seed should import already published');
  });

  await step('changing the anchor shifts every block', async () => {
    await page.fill('#sec-schedule input[type=time]', '11:00');
    await page.waitForTimeout(100);
    const times = await page.$$eval('#sec-schedule .times', ns => ns.map(n => n.textContent.trim()));
    if (times[0] !== '11:00 AM – 11:10 AM') throw new Error(`first: ${times[0]}`);
    if (times.at(-1) !== '1:05 PM – 1:55 PM') throw new Error(`last: ${times.at(-1)}`);
  });

  await step('editing a duration shifts only what follows', async () => {
    const dur = page.locator('#sec-schedule .inp--dur').first();
    await dur.fill('20');
    await page.waitForTimeout(100);
    const times = await page.$$eval('#sec-schedule .times', ns => ns.map(n => n.textContent.trim()));
    if (times[0] !== '11:00 AM – 11:20 AM') throw new Error(`first: ${times[0]}`);
    if (times[1] !== '11:20 AM – 11:40 AM') throw new Error(`second: ${times[1]}`);
    const total = await page.textContent('#sec-schedule .total');
    if (!total.includes('3h 5m')) throw new Error(`total: ${total}`);
  });

  await step('stated total mismatch is flagged', async () => {
    const stated = page.locator('#sec-schedule input[placeholder*="3h"]');
    await stated.fill('3h');
    await stated.blur();
    await page.waitForTimeout(100);
    const warn = page.locator('#sec-schedule .warn-banner');
    if (!(await warn.isVisible())) throw new Error('no mismatch banner');
    const t = await warn.textContent();
    if (!t.includes('3h 5m') || !t.includes('3h')) throw new Error(t);
  });

  await step('clearing a description blocks publishing', async () => {
    const desc = page.locator('#sec-schedule .block textarea').first();
    await desc.fill('');
    await page.waitForTimeout(250);
    const meter = await page.textContent('.meter');
    if (!meter.includes('no description')) throw new Error(meter.slice(0, 200));
    if (!meter.includes('no longer meets the standard'))
      throw new Error('expected the published-but-invalid warning');
    await desc.fill('Restored description.');
    await page.waitForTimeout(250);
  });

  await step('materials scale 60 -> 120 students', async () => {
    const before = await page.$$eval('#sec-materials .grid-row input[type=number]',
      ns => ns.map(n => n.value));
    const students = page.locator('#sec-materials .scaler input').nth(1);
    await students.fill('120');
    await students.blur();
    await page.waitForTimeout(150);
    const after = await page.$$eval('#sec-materials .grid-row input[type=number]',
      ns => ns.map(n => n.value));
    if (Number(after[0]) !== Number(before[0]) * 2)
      throw new Error(`${before[0]} -> ${after[0]}`);
  });

  await step('nested prep checklist renders its tree', async () => {
    const depth = await page.$$eval('#sec-classLeadPrep .checklist-level .checklist-level .checklist-level',
      ns => ns.length);
    if (depth < 1) throw new Error('no third level');
    const boxes = await page.locator('#sec-classLeadPrep .chk').count();
    if (boxes !== 18) throw new Error(`${boxes} checkboxes`);
  });

  await step('adding an objective offers the measurable stem', async () => {
    const n = await page.locator('#sec-objectives .row').count();
    await page.click('#sec-objectives button:has-text("Add objective")');
    await page.waitForTimeout(100);
    const inputs = page.locator('#sec-objectives .row textarea');
    if (await inputs.count() !== n + 1) throw new Error('no new row');
    const v = await inputs.last().inputValue();
    if (!v.startsWith('Students will be able to')) throw new Error(`stem was "${v}"`);
    await page.locator('#sec-objectives .row').last().locator('.icon-btn--danger').click();
  });

  await step('save round-trips and bumps the version', async () => {
    await page.click('.toolbar .btn--primary');
    await page.waitForSelector('.save-status--ok', { timeout: 5000 });
    const s = await page.textContent('.save-status');
    if (!/v2/.test(s)) throw new Error(s);
    const attr = await page.textContent('.attribution');
    if (!attr.includes('Last edited by Test Person')) throw new Error(attr);
  });

  await step('reload keeps the edits', async () => {
    await page.reload();
    await page.waitForSelector('.editor');
    const times = await page.$$eval('#sec-schedule .times', ns => ns.map(n => n.textContent.trim()));
    if (times[0] !== '11:00 AM – 11:20 AM') throw new Error(`first: ${times[0]}`);
  });

  await step('version history lists the previous version', async () => {
    await page.click('.toolbar button:has-text("History")');
    await page.waitForSelector('.version-list li');
    const t = await page.textContent('.version-list');
    if (!t.includes('v1')) throw new Error(t);
    await page.click('.drawer button:has-text("Close")');
  });

  await step('back to the list, then duplicate', async () => {
    await page.click('.toolbar a:has-text("All plans")');
    await page.waitForSelector('.plan-row');
    await page.click('.plan-row button:has-text("Duplicate")');
    await page.waitForSelector('.editor');
    const title = await page.inputValue('.inp--title');
    if (!title.endsWith('(copy)')) throw new Error(title);
    await page.click('.toolbar a:has-text("All plans")');
    await page.waitForSelector('.plan-row');
    if (await page.locator('.plan-row').count() !== 2) throw new Error('expected 2 plans');
  });

  await step('new blank plan is not publishable', async () => {
    await page.click('.toolbar button:has-text("New plan")');
    await page.waitForSelector('.editor');
    const meter = await page.textContent('.meter');
    if (!/thing\(s\) to fix/.test(meter)) throw new Error(meter.slice(0, 120));
    if (!(await page.locator('#publish-toggle').isDisabled()))
      throw new Error('Publish enabled on a blank plan');
  });
}
// ---------------------------------------------------------------- drag, reorder, concurrency

{
  const { ctx, page } = await session();
  /**
 * Playwright's synthetic mouse drag is unreliable for native HTML5 DnD once a
 * page gets tall, so dispatch the drag events directly. This exercises the same
 * dragstart/dragover/drop handlers the browser would fire.
 * `into` = "before the item at that index in that list", or the end of it.
 */
const dragItem = (page, fromSel, toListSel, toIndex) => page.evaluate(
  ({ fromSel, toListSel, toIndex }) => {
    const item = document.querySelector(fromSel);
    const list = document.querySelector(toListSel);
    if (!item || !list) throw new Error('drag selectors did not match');
    const targets = [...list.children].filter(c => c.dataset.index);
    const anchor = targets[toIndex];
    const box = anchor ? anchor.getBoundingClientRect() : list.getBoundingClientRect();
    const clientY = anchor ? box.top + 2 : box.bottom - 2;
    const dataTransfer = new DataTransfer();
    const fire = (type, target, extra = {}) => target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...extra }));
    fire('dragstart', item);
    fire('dragover', list, { clientY });
    fire('drop', list, { clientY });
    fire('dragend', item);
  }, { fromSel, toListSel, toIndex });

const titles = () => page.$$eval('#sec-schedule .block .inp.grow', ns => ns.map(n => n.value));
  const times  = () => page.$$eval('#sec-schedule .times', ns => ns.map(n => n.textContent.trim()));
  const phaseTotals = () => page.$$eval('#sec-schedule .phase-head .pill', ns => ns.map(n => n.textContent));

  await page.goto(URL);
  await page.fill('.gate input[aria-label="Your name"]', 'Dragger');
  await page.click('.gate button[type=submit]');
  await page.click('text=Import the Build a Bird example');
  await page.waitForSelector('.editor');

  await step('blocks, phases and list rows are marked draggable', async () => {
    const flags = await page.$$eval('#sec-schedule .block, #sec-schedule .phase, #sec-objectives .ol-rows > li',
      ns => ns.every(n => n.draggable));
    if (!flags) throw new Error('something is not draggable');
  });

  await step('drag a block up within its phase recomputes times', async () => {
    const before = await titles();
    await dragItem(page,
      '#sec-schedule .phase:nth-of-type(1) .blocks > .block[data-index="1"]',
      '#sec-schedule .phase:nth-of-type(1) .blocks', 0);
    await page.waitForTimeout(200);
    const after = await titles();
    if (after[0] !== before[1] || after[1] !== before[0])
      throw new Error(`${JSON.stringify(before.slice(0,2))} -> ${JSON.stringify(after.slice(0,2))}`);
    const t = await times();
    // Bird Bingo (20m) now runs first, Welcoming Circle (10m) second.
    if (t[0] !== '9:00 AM – 9:20 AM') throw new Error(`first: ${t[0]}`);
    if (t[1] !== '9:20 AM – 9:30 AM') throw new Error(`second: ${t[1]}`);
  });

  await step('drag a block into another phase and both subtotals move', async () => {
    const totalsBefore = await phaseTotals();
    await dragItem(page,
      '#sec-schedule .phase:nth-of-type(1) .blocks > .block[data-index="0"]',
      '#sec-schedule .phase:nth-of-type(2) .blocks', 0);
    await page.waitForTimeout(200);
    const totalsAfter = await phaseTotals();
    if (totalsBefore[0] === totalsAfter[0] || totalsBefore[1] === totalsAfter[1])
      throw new Error(`${totalsBefore.slice(0,2)} -> ${totalsAfter.slice(0,2)}`);
    const counts = await page.$$eval('#sec-schedule .phase',
      ns => ns.map(n => n.querySelectorAll('.block').length));
    if (counts[0] !== 1 || counts[1] !== 3) throw new Error(`block counts ${counts}`);
  });

  await step('the grand total is unchanged by any reorder', async () => {
    const total = await page.textContent('#sec-schedule .total');
    if (!total.includes('2h 55m')) throw new Error(total);
  });

  await step('the up button walks a phase to the top and times follow', async () => {
    const up = i => page.locator('#sec-schedule .phase').nth(i)
      .locator('.phase-head button[title="Move phase up"]');
    for (let i = 3; i > 0; i--) { await up(i).click(); await page.waitForTimeout(60); }
    const names = await page.$$eval('#sec-schedule .inp--phase', ns => ns.map(n => n.value));
    if (names[0] !== 'Lunch') throw new Error(`phases: ${names}`);
    const t = await times();
    if (t[0] !== '9:00 AM – 9:40 AM') throw new Error(`lunch first: ${t[0]}`);
  });

  await step('the first phase cannot move up past the top', async () => {
    const names = await page.$$eval('#sec-schedule .inp--phase', ns => ns.map(n => n.value));
    await page.locator('#sec-schedule .phase').nth(0)
      .locator('.phase-head button[title="Move phase up"]').click();
    await page.waitForTimeout(80);
    const after = await page.$$eval('#sec-schedule .inp--phase', ns => ns.map(n => n.value));
    if (JSON.stringify(names) !== JSON.stringify(after)) throw new Error(`${after}`);
  });

  await step('a block stepped up off the top of its phase joins the phase above', async () => {
    const counts = () => page.$$eval('#sec-schedule .phase',
      ns => ns.map(n => n.querySelectorAll('.block').length));
    const before = await counts();
    await page.locator('#sec-schedule .phase').nth(1).locator('.block').nth(0)
      .locator('button[title="Move block up"]').click();
    await page.waitForTimeout(80);
    const after = await counts();
    if (after[0] !== before[0] + 1 || after[1] !== before[1] - 1)
      throw new Error(`${before} -> ${after}`);
    const total = await page.textContent('#sec-schedule .total');
    if (!total.includes('2h 55m')) throw new Error(`grand total changed: ${total}`);
  });

  await step('reorder an objective by dragging', async () => {
    const before = await page.$$eval('#sec-objectives .row textarea', ns => ns.map(n => n.value));
    await dragItem(page, '#sec-objectives .ol-rows > li[data-index="2"]',
      '#sec-objectives .ol-rows', 0);
    await page.waitForTimeout(200);
    const after = await page.$$eval('#sec-objectives .row textarea', ns => ns.map(n => n.value));
    if (after[0] !== before[2]) throw new Error(`${after[0]}`);
  });

  const prepRoots = () => page.$$eval('#sec-classLeadPrep > .checklist > .checklist-level > li', ns => ns.length);
  const prepBoxes = () => page.locator('#sec-classLeadPrep .chk').count();

  await step('Enter adds a sibling prep item', async () => {
    const before = await prepRoots();
    const second = page.locator('#sec-classLeadPrep > .checklist > .checklist-level > li').nth(1)
      .locator(':scope > .check-row input[type=text]');
    await second.click();
    await second.press('Enter');
    await page.waitForTimeout(100);
    if (await prepRoots() !== before + 1) throw new Error(`${before} -> ${await prepRoots()}`);
    await page.keyboard.type('Added by keyboard');
    await page.waitForTimeout(100);
  });

  await step('Tab indents a prep item under the one above', async () => {
    const before = await prepRoots();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    if (await prepRoots() !== before - 1) throw new Error(`root count ${before} -> ${await prepRoots()}`);
    const nested = await page.locator('#sec-classLeadPrep .checklist-level .checklist-level input[type=text]')
      .evaluateAll(ns => ns.map(n => n.value));
    if (!nested.includes('Added by keyboard')) throw new Error('not nested');
  });

  await step('Shift-Tab puts it back at the top level', async () => {
    const before = await prepRoots();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    if (await prepRoots() !== before + 1) throw new Error(`root count ${before} -> ${await prepRoots()}`);
  });

  await step('nothing was lost along the way', async () => {
    if (await prepBoxes() !== 19) throw new Error(`${await prepBoxes()} checkboxes, expected 19`);
    await page.locator('#sec-classLeadPrep > .checklist > .checklist-level > li').nth(2)
      .locator(':scope > .check-row .icon-btn--danger').click();
    await page.waitForTimeout(100);
    if (await prepBoxes() !== 18) throw new Error(`${await prepBoxes()} after delete`);
  });

  await step('a prep checkbox actually ticks', async () => {
    const box = page.locator('#sec-classLeadPrep .chk').nth(1);
    await box.check();
    if (!(await box.isChecked())) throw new Error('did not tick');
  });

  await step('save the reordered plan', async () => {
    await page.click('.toolbar .btn--primary');
    await page.waitForSelector('.save-status--ok');
  });

  // ---- concurrent edit from a second tab ----
  await step('a second tab saving first makes the stale save a conflict', async () => {
    const url = page.url();
    const other = await ctx.newPage();
    other.setDefaultTimeout(6000);
    other.on('dialog', d => d.accept());
    await other.goto(url);
    await other.waitForSelector('.editor');
    await other.fill('.inp--title', 'Saved by the other tab');
    await other.click('.toolbar .btn--primary');
    await other.waitForSelector('.save-status--ok');
    await other.close();

    // First tab is now stale. Decline the overwrite prompt.
    page.removeAllListeners('dialog');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.fill('.inp--title', 'Saved by the first tab');
    await page.click('.toolbar .btn--primary');
    await page.waitForSelector('.save-status--dirty');
    if (!/saved this plan while you were editing/.test(asked))
      throw new Error(`prompt was: ${asked}`);
    const status = await page.textContent('.save-status');
    if (status !== 'Not saved') throw new Error(status);
  });

  await step('accepting the overwrite saves and keeps the other version in history', async () => {
    page.once('dialog', d => d.accept());
    await page.click('.toolbar .btn--primary');
    await page.waitForSelector('.save-status--ok');
    await page.click('.toolbar button:has-text("History")');
    await page.waitForSelector('.version-list li');
    const t = await page.textContent('.version-list');
    if (!/v2/.test(t) || !/v1/.test(t)) throw new Error(t);
    await page.click('.drawer button:has-text("Close")');
  });

  await step('restoring an old version puts it back in the editor unsaved', async () => {
    await page.click('.toolbar button:has-text("History")');
    await page.waitForSelector('.version-list li');
    await page.locator('.version-list li').last().locator('button').click();
    await page.waitForSelector('.save-status--dirty');
    const title = await page.inputValue('.inp--title');
    if (title !== 'Build a Bird') throw new Error(`restored title: ${title}`);
  });



}

await step('no console errors anywhere', () => {
  if (errors.length) throw new Error(errors.join('\n       '));
});

await browser.close();
if (failures) { console.log(`\n${failures} failure(s)\n`); process.exit(1); }
console.log('\nall browser checks passed\n');
