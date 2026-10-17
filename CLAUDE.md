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
- App dev / test / lint / build: not defined yet (filled after TSK-002). Proposed: `pnpm dev | test | lint | package` `[unverified]`.
- Dev machine: Node 26.10, pnpm 11.10, Python 3.14.6, pip 26.1.

## Conventions

- Docs and markdown: short, bullets and ordered lists.
- IDs: capacity `THnn-nn`, requirement `REQ-nnn` (functional) / `TSK-nnn` (technical), decision `AD-nn`.
- Commits: `<type>(<scope>): <summary> [<req-id>]`, one plan step per commit.
- Code style: `_docs/1.architecture-overview.html` › Conventions › Code style (no member comments, single-line imports, no `Omit`, `data-testid`, unit tests only on request).
