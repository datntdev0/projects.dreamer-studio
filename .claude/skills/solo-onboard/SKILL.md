---
name: solo-onboard
description: Architect reads and analyzes the whole codebase and generates high-level docs (.claude/README.md, _docs/1.architecture-overview.html, and _docs/0.architecture-decision.html when questions are open). Use at project start or after big structural changes.
argument-hint: "[focus area]"
---

# solo-onboard

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `analyst` (requirement context), `coder` (verify commands), human (gate).
- **Artifacts**:
  - `.claude/README.md` — project section
  - `_docs/1.architecture-overview.html` — overview, context diagrams, repository structure, conventions
  - `Open Decisions` sheet in `_docs/0.requirements-analysis.xlsx` — architecture questions (source of truth)
  - `_docs/0.architecture-decision.html` — viewer of that sheet, where the human picks options

## Workflow

`collect ──► analyze ──► propose ──► human gate`

1. **Collect**
   - Repo tree, README, `DESIGN.md`, `_docs/`, build/package files, CI, `git log --oneline -20`.
   - Large codebase: spawn `Explore` agents in parallel, one per top-level area.
   - Spawn `analyst`: "summarize approved capacities for the next release and their technical needs".
2. **Analyze**
   - Tech stack, layers and how they talk, folder → layer mapping.
   - Conventions: naming, error handling, logging, tests, commits.
   - Commands: dev, test, lint, build. Spawn `coder` to run them and report what works.
   - List gaps and open questions (missing stack choice, unclear layering, …).
3. **Propose**
   - Create docs: `python .claude/scripts/docs.py new architecture-overview` (and `architecture-decision` if missing).
   - Write questions to the sheet: `reqs.py upsert patch.json` with `"decisions": [...]` (`AD-nn`, options one per line `<title> — <details>`, `Recommended`, `Status` `Open`).
   - Fill each section with facts; mark guesses `[unverified]`.
   - Update the project section of `.claude/README.md` and the commands in `CLAUDE.md`.
4. **Human gate**
   - Show: 5-line summary, artifact paths, open questions.
   - Human answers in the HTML (`docs.py serve`) → **Export decisions** → pastes back.
   - Apply answers: upsert `Decision`, `Status` `Decided`, `Notes`, `Decided On`; update the overview; repeat until the human approves.
