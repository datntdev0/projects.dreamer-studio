# CLAUDE.md

- `.claude/README.md` — project overview and the Claude framework (agents, skills, scripts).
- `DESIGN.md` — visual tokens; never use raw colors, sizes or spacing in UI code.
- `_docs/1.architecture-overview.html` — architecture; decisions in the xlsx `Open Decisions` sheet (`reqs.py decisions`).
- `_docs/0.requirements-analysis.xlsx` — capability intent (L1), feature/change specifications (L2), and decisions; read it with `python .claude/scripts/reqs.py list`, view it in `_docs/0.requirements-analysis.html`.

## Workflow

`/solo-onboard` ──► `/solo-analysis` ──► `/solo-solution <ID>` ──► `/solo-implement <ID>`

Quick path: `/solo-prototype <idea>` (no docs, no gates in between).

- Use a workflow skill only when the human invokes or names it. Otherwise do only the task asked: no extra steps (plan, xlsx or doc updates, review, tests, commits, sub-agents) unless asked.
- Each skill ends with a human gate.
- Sub-agents: one small task per spawn; the agent reports and its session ends. Split heavy work first; never reuse a finished sub-agent for a new task.

## Commands

- Capabilities, Level 2 specifications, and decisions: `python .claude/scripts/reqs.py list | decisions | check | next-id` (read-only)
- Docs: `python .claude/scripts/docs.py new <type> [ID]`, `python .claude/scripts/docs.py serve`
- First run: `pnpm install`, then `pnpm py:setup` (creates `backend/.venv`).
- App: `pnpm dev | lint | format | format:check | test | test:coverage | check` (`lint` runs `scripts/check-i18n.mjs` first; `check` = lint + format:check + test; `test:coverage` → `.testing/coverage/<electron|angular|python>`).
- Design system: `pnpm storybook` (port 6006), `pnpm storybook:build`; stories in `angular/stories`, components imported via `@components/*`.
- Build and package: `node scripts/build.mjs build` (no `pnpm build` script), `pnpm start` (builds, then runs the app), `pnpm package` → `.output/DreamerStudio-<version>-win-x64.zip`, or `-linux-<arch>.AppImage` when run on Ubuntu (overview › Build and Release).
- Dev machine: Node 26.10, pnpm 11.10, Python 3.14.6, pip 26.1.

## Conventions

- Docs and markdown: short, bullets and ordered lists.
- IDs: capability `THnn-nn`, Level 2 spec `L2-THnn-nn-nn`, decision `ADR-nn`.
- Commits: `<type>(<scope>): <summary> [<Capability ID>]`, one plan step per commit. Do not over 100 characters in the summary.
- Code style: `_docs/1.architecture-overview.html` › Conventions › Code style:
  - no member comments, single-line imports, no `Omit` 
  - `data-testid`, unit tests only on request;
  - Angular: separate `.html` + `.ts`, styles only in global SCSS, no component per state/variant.
