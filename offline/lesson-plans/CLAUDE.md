# lesson-plans/CLAUDE.md

Lesson plan authoring tool — a child app of the NYC FIRST D13 site, fork-only (lives in `offline/`, not deployed; locally at `/d13-app/offline/lesson-plans/lesson-plans`).

The page is `lesson-plans.html`, here alongside its modules and assets. See the root `CLAUDE.md` for the layout rule and the `<base href>` contract.

## Purpose

Replaces the STEM Center's Google Docs lesson plans with a guided form, so every plan meets the three D13 standards without anyone having to remember them:

- **Information** — every plan has the same sections, in the same order.
- **Depth** — measurable objectives, timed schedule blocks with descriptions, procedures written as numbered steps.
- **Procedure** — prep checklist, run-of-show, per-block timing, facilitation notes.

Audience is non-technical staff. No build step; vanilla ES modules served over HTTP.

## Architecture

| File | Role |
|---|---|
| `lesson-plans.html` | Shell: brand header, `#view` mount, module entry. Everything else is rendered. |
| `app.js` | Hash routing (`#/`, `#/plan/<id>`), the name/key gate, plan list, editor shell (save, attribution, history, completeness meter). |
| `modules/schema.js` | `blankPlan()`, `normalize()`, checklist helpers, `rescalePurchasing()`. The field order here **is** the standard. |
| `modules/store.js` | The only file that talks to a backend. Set `EXEC_URL` to the deployed Apps Script. |
| `modules/schedule.js` | Pure. `layout(schedule)` — the time cascade, phase subtotals, grand total, stated-total mismatch. |
| `modules/validate.js` | Pure. `check(plan)` — blockers, warnings, score, `canPublish`. |
| `modules/fields.js` | Widget kit: `el()`, `sortable()`, string lists, repeatable rows, nested checklist, rich text, image upload, gallery. Knows nothing about lesson plans. |
| `modules/editor.js` | The guided form, section by section, including the schedule builder. |
| `docs/apps-script.gs` | The backend. Paste into Apps Script; setup steps are in its header comment. |
| `docs/notebooklm-prompt.md` | Staff-facing: turn a Google Slides deck into plan JSON with NotebookLM, then **Import JSON** on the list view. Its checklist is `validate.js`'s blockers in prose — `tests.mjs` asserts the two agree. |
| `seed/build-a-bird.json` | The reference plan, importable from the list view. |
| `tests.mjs` | `node offline/lesson-plans/tests.mjs` — pure logic, no dependencies. |
| `browser-tests.mjs` | `node offline/lesson-plans/browser-tests.mjs` against `npm run serve`. Skips if Playwright is absent. |

### Key decisions

- **Only `duration` and `startAnchor` are stored.** Every start/end time is derived by `layout()` on each render, so a drag, a duration edit or an anchor change recomputes everything downstream for free. Storing computed times would mean keeping them in sync, which is the bug.
- **Google Sheet + Apps Script, not Supabase.** Same posture as `arcade/`, `stem-stations/` and `laser-maker/`. Supabase is the intended upgrade; it means rewriting `store.js` and nothing else.
- **Reads go through Apps Script `doGet`, not a published-Sheet CSV** as `arcade/` does. Keeps the sheet private, the data fresh, and read+write on one endpoint.
- **Shared key, not Google sign-in.** A domain-restricted Apps Script web app cannot be called cross-origin from a static page, and real sign-in would need an OAuth Client ID. Attribution is self-reported. Same shape as the PIN in `laser-maker/modules/drive-upload.js`.
- **Optimistic concurrency on save.** The client sends the version it loaded; a stale write is refused, not merged. Two staff on one plan would otherwise silently lose work.
- **With no `EXEC_URL`, everything runs against `localStorage`** — same shapes, same version and conflict semantics — so the app is usable and demoable before the Sheet exists.
- **Tokens are copied from `laser-maker/styles.css`, not `@import`-ed.** That sheet is 55 KB of canvas chrome and sets `html, body { height: 100% }`, wrong for a scrolling document. Same call `present/` made.
- **Reorder has buttons as well as drag.** Drag is not reachable from a keyboard and is fiddly across a long schedule.
- **Measurable phrasing warns, never blocks.** Gating on "Students will be able to" would teach staff to paste the words without meaning them.

### Deferred

Pacing calendar · shopping-list rollup across plans · export to Doc/Markdown (print to PDF works today) · import existing `.md` plans · day-of run mode · reusable kit/station library · structured per-block staffing · real Google sign-in.

## Setup

1. Follow the SETUP comment at the top of `docs/apps-script.gs` — a Sheet, a Drive folder, three Script Properties, deploy as a web app.
2. Put the `/exec` URL in `EXEC_URL` at the top of `modules/store.js`.

Until then the app runs entirely in the browser's own storage.

## Checks

```bash
node offline/lesson-plans/tests.mjs                     # pure logic, no deps
npm run serve                                   # then, in another terminal:
node offline/lesson-plans/browser-tests.mjs             # end-to-end, skips without Playwright
python3 tools/check-links.py
python3 tools/serve-like-webflow.py --audit
```

`browser-tests.mjs` dispatches drag events directly rather than driving the mouse: synthetic native HTML5 drags are unreliable in headless Chromium once the page is tall. It asserts separately that the items are `draggable`.

## Git & Commits

Repo root is the parent directory — `lesson-plans/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `offline/lesson-plans/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/dev/d13 add offline/lesson-plans/<path>
git -C /Users/avigoldman/dev/d13 commit -m "feat(lesson-plans): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
