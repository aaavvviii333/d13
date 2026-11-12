# wifi-proposal/CLAUDE.md

Staff 5G network proposal — a child app of the NYC FIRST D13 site, served by Webflow Cloud at `/d13-app/wifi-proposal`.

The page is `wifi-proposal.html`, fully self-contained (inline CSS/SVG, data-URI logo; only external load is Google Fonts). Source of truth lives in `~/dev/wifi-proposal/` — edit there, copy over. See the root `CLAUDE.md` for the layout rule and the `<base href>` contract.

## Git & Commits

Repo root is the parent directory — `wifi-proposal/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `wifi-proposal/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/dev/d13 add wifi-proposal/<path>
git -C /Users/avigoldman/dev/d13 commit -m "feat(wifi-proposal): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
