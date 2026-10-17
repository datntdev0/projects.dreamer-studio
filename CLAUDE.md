# CLAUDE.md

Dreamer Studio: local desktop studio that uses AI to produce creative content. Pre-code stage.

## Read first

- `.claude/README.md` — project overview and the Claude framework (agents, skills, scripts).
- `DESIGN.md` — visual tokens; never use raw colors, sizes or spacing in UI code.
- `_docs/0.requirements-analysis.xlsx` — requirements; read it with `python .claude/scripts/reqs.py list`.

## Workflow

`/solo-onboard` ──► `/solo-analysis` ──► `/solo-solution <ID>` ──► `/solo-implement <ID>`

- Each skill ends with a human gate.
- Never edit the xlsx by hand from code; use `reqs.py upsert` so the capacity dropdown is kept.

## Commands

- Requirements: `python .claude/scripts/reqs.py list | check | next-id | upsert <patch.json>`
- Docs: `python .claude/scripts/docs.py new <type> [ID]`, `python .claude/scripts/docs.py serve`
- App dev / test / lint / build: not defined yet (filled by `/solo-onboard` after TSK-001/TSK-002).

## Conventions

- Docs and markdown: short, bullets and ordered lists.
- IDs: capacity `THnn-nn`, requirement `REQ-nnn` (functional) / `TSK-nnn` (technical).
- Commits: `<type>(<scope>): <summary> [<req-id>]`, one plan step per commit.
