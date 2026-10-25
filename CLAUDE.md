# CLAUDE.md

Dreamer Studio: local desktop studio that uses AI to produce creative content. Pre-code stage.

## Read first

- `.claude/README.md` — project overview and the Claude framework (agents, skills, scripts).
- `DESIGN.md` — visual tokens; never use raw colors, sizes or spacing in UI code.
- `_docs/1.architecture-overview.html` — architecture; decisions in the xlsx `Open Decisions` sheet (`reqs.py decisions`).
- `_docs/0.requirements-analysis.xlsx` — requirements; read it with `python .claude/scripts/reqs.py list`.

## Workflow

`/solo-onboard` ──► `/solo-analysis` ──► `/solo-solution <ID>` ──► `/solo-implement <ID>`

- Each skill ends with a human gate.
- Never edit the xlsx by hand from code; use `reqs.py upsert` so the dropdowns are kept.

## Commands

- Requirements and decisions: `python .claude/scripts/reqs.py list | decisions | check | next-id | upsert <patch.json>`
- Docs: `python .claude/scripts/docs.py new <type> [ID]`, `python .claude/scripts/docs.py serve`
- First run: `pnpm install`, then `pnpm py:setup` (creates `backend/.venv`).
- App: `pnpm dev | lint | format | format:check | test | test:coverage | check` (`lint` runs `scripts/check-i18n.mjs` first; `check` = lint + format:check + test; `test:coverage` → `coverage/<electron|angular|python>`).
- Design system: `pnpm storybook` (port 6006), `pnpm storybook:build`; stories in `angular/stories`, components imported via `@components/*`.
- Build and package: `node scripts/build.mjs build` (no `pnpm build` script), `pnpm start` (builds, then runs the app), `pnpm package` → `dist/DreamerStudio-<version>-win-x64.zip`, or `-linux-<arch>.AppImage` when run on Ubuntu (overview › Build and Release).
- Dev machine: Node 26.10, pnpm 11.10, Python 3.14.6, pip 26.1.

## Conventions

- Docs and markdown: short, bullets and ordered lists.
- IDs: capacity `THnn-nn`, requirement `REQ-nnn` (functional) / `TSK-nnn` (technical), decision `AD-nn`.
- Commits: `<type>(<scope>): <summary> [<req-id>]`, one plan step per commit. Do not over 100 characters in the summary.
- Code style: `_docs/1.architecture-overview.html` › Conventions › Code style:
  - no member comments, single-line imports, no `Omit` 
  - `data-testid`, unit tests only on request;
  - Angular: separate `.html` + `.ts`, styles only in global SCSS, no component per state/variant.
