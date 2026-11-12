# NotebookLM → lesson plan JSON

How to turn a Google Slides lesson deck into a D13 lesson plan.

## Staff steps

1. Go to [notebooklm.google.com](https://notebooklm.google.com), **Create new notebook**.
2. **Add source → Google Drive → Google Slides**, pick the lesson deck. Add the
   facilitator's notes doc, the materials list, photos of the build — any source
   that describes how the lesson actually runs. More sources, fewer `TBD`s.
3. Paste the prompt below into the chat box. Send.
4. Copy the JSON it returns (the whole code block, `{` to `}`).
5. Open [the lesson plan tool](https://www.nycfirst.org/d13-app/lesson-plans),
   click **Import JSON**, paste, save.
6. Fill in every `TBD —` the draft left behind. NotebookLM only knows what the
   deck says; it cannot know your room, your staffing or your supply closet.

NotebookLM answers only from the sources you give it. That is the point — it
will not invent a plausible materials list — but it also means a thin deck
makes a thin plan. It is not a substitute for knowing the lesson.

---

## The prompt

Copy everything between the lines.

---

You are drafting a lesson plan for the NYC FIRST District 13 STEM Center, from
the sources in this notebook. The audience is a class lead who has never taught
this lesson and is reading the plan the morning it runs.

Answer with **one JSON object and nothing else** — no preamble, no citation
markers, no commentary after it. Match this shape exactly:

```json
{
  "title": "",
  "overview": "",
  "pacing": { "gradeBand": "", "curriculumUnit": "", "seasonDateRange": "", "links": [] },
  "purpose": [],
  "objectives": [],
  "materials": {
    "scaledForClasses": 1,
    "scaledForStudents": 30,
    "assetLinks": [{ "label": "", "url": "" }],
    "purchasing": [{ "item": "", "quantity": 0, "unit": "", "url": "" }]
  },
  "classLeadPrep": [{ "text": "", "checked": false, "children": [] }],
  "schedule": {
    "startAnchor": "",
    "statedTotalMinutes": null,
    "phases": [{
      "name": "",
      "blocks": [{
        "title": "",
        "duration": 0,
        "description": "",
        "detailedSteps": [],
        "facilitationNote": ""
      }]
    }]
  },
  "assessment": [],
  "skillsLearned": [],
  "photos": []
}
```

Field by field:

- **title** — what the lesson is called. From the deck's title slide.
- **overview** — 2–4 sentences. What students make or do, and why it matters.
  Written to a colleague, not to a funder.
- **pacing.gradeBand** — e.g. `"3–5"`, `"6–8"`. `seasonDateRange` is when in the
  year this runs. `links` are `{label, url}` to the deck and any pacing calendar.
- **purpose** — the aims. Why this lesson exists in the unit. One idea per string.
- **objectives** — every one starts `"Students will be able to "` and ends in
  something you could watch a student do. "understand circuits" is not an
  objective; "close a circuit so the LED lights" is.
- **materials.purchasing** — one row per consumable or tool. `quantity` is a
  number for 30 students unless the deck says otherwise; use the string
  `"as needed"` when a count is meaningless. `unit` is `"roll"`, `"sheet"`,
  `"pack"`. `url` is a supplier link if a source names one, else `""`.
- **materials.assetLinks** — `{label, url}` for the slide deck itself, worksheets,
  laser-cut files, videos.
- **classLeadPrep** — what gets done *before* students walk in, in the order you
  would do it. At least 3 items. Nest sub-steps in `children`. Cutting,
  printing, charging, pre-building the demo, setting out the stations.
- **schedule.phases** — group blocks into phases (`"Setup"`, `"Lesson"`,
  `"Cleanup"`). Every block needs:
  - `duration` in whole minutes, greater than 0.
  - `description` — one or two sentences on what happens.
  - `detailedSteps` — the procedure as an ordered array of strings. **At least
    one block must have 2 or more.** Write the steps for the build blocks; that
    is where a new lead gets stuck.
  - `facilitationNote` — who does what. Lead vs. support, station rotations,
    where the adult stands. **At least one block must have one.**
  - `startAnchor` is a clock time like `"09:30"` if a source gives one, else `""`.
    Do not put start or end times on blocks — the tool computes them from
    durations.
- **assessment** — how the lead knows learning happened. Observable checks, exit
  tickets, what a finished build looks like. Not "students seemed engaged".
- **skillsLearned** — the transferable skills, named plainly: measuring,
  soldering, iterating on a failed design.
- **photos** — `[]`. Staff add these later.

Rules:

1. **Every string comes from the sources.** Do not invent a material, a time or
   a step the sources do not support.
2. **Where a source is silent, write `"TBD — "` and the question a human must
   answer.** `"TBD — how many minutes for cleanup?"` A `TBD` is useful; a guess
   dressed as fact is not. Never leave a required field empty to avoid a `TBD`.
3. **Durations must be real minutes.** If the deck gives no timing, estimate from
   the work described and mark it: `"description": "… TBD — confirm timing."`
4. Keep `detailedSteps` as steps, not paragraphs. One action per string.
5. Strip citation markers like `[1]` from the JSON.

Before you answer, check your draft against this list and fix what fails:

- [ ] `title`, `overview`, `pacing.gradeBand` all non-empty
- [ ] at least one `purpose`, one `objective`, one `assessment`, one `skillsLearned`
- [ ] at least one `materials.purchasing` row with an `item`
- [ ] `classLeadPrep` has 3 or more items
- [ ] every block has a `duration` above 0 and a `description`
- [ ] at least one block has 2 or more `detailedSteps`
- [ ] at least one block has a `facilitationNote`
- [ ] every `objective` starts with "Students will be able to"
- [ ] valid JSON, nothing outside the code block

---

## If the output is wrong

| What happened | Say this |
|---|---|
| It wrote prose around the JSON | `Answer with only the JSON object. No text before or after.` |
| It cut the JSON short | `Continue the JSON from where you stopped.` |
| Blocks have no steps | `Rewrite the build blocks with detailedSteps as numbered actions, one per string.` |
| Everything is TBD | The deck is thin. Add the facilitator notes as a second source. |
| It guessed a materials list | `Remove anything the sources do not name. Replace each with a TBD question.` |
