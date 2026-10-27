---
name: solo-onboard
description: Architect reads and analyzes the whole codebase and generates high-level docs (.claude/README.md project section, _docs/1.architecture-overview.html, and Open Decisions in the requirements xlsx when questions are open). Use at project start or after big structural changes.
argument-hint: "[focus area]"
---

# solo-onboard

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `analyst` (requirement context), `coder` (verify commands), human (gate).
- **Artifacts**:
  - `.claude/README.md` — project section: What, Stack, Folders, Sources of truth (short bullets; no releases or decision lists)
  - `_docs/1.architecture-overview.html` — overview, context diagrams, repository structure, conventions
  - Proposed rows for the `Open Decisions` sheet in `_docs/0.requirements-analysis.xlsx` — architecture questions; the human adds them (viewed in `_docs/0.requirements-analysis.html` › Decisions)

## Workflow

`collect ──► analyze ──► propose ──► human gate`

1. **Collect**
   - Repo tree, README, `DESIGN.md`, `_docs/`, build/package files, CI, `git log --oneline -20`.
   - Large codebase: spawn `Explore` agents in parallel, one per top-level area.
   - Spawn `analyst`: "summarize approved capacities for the next release and their technical needs".
   - Each spawned agent covers one area or one question and ends when it reports.
2. **Analyze**
   - Tech stack, layers and how they talk, folder → layer mapping.
   - Conventions: naming, error handling, logging, tests, commits.
   - Commands: dev, test, lint, build. Spawn `coder` to run them and report what works.
   - List gaps and open questions (missing stack choice, unclear layering, …).
3. **Propose**
   - Create docs: `python .claude/scripts/docs.py new architecture-overview` (and `requirements-analysis` if missing).
   - Propose question rows as a table for the human to add (`ADR-nn` from `reqs.py next-id`, `Affects` = capacity IDs, options in `Decision` one per line `<title> — <details>`, `Recommended`, `Status` `Open`).
   - Fill each section with facts; mark guesses `[unverified]`.
   - Update the project section of `.claude/README.md` and the commands in `CLAUDE.md`.
4. **Human gate**
   - Show: 5-line summary, artifact paths, open questions.
   - Human records the answers in the xlsx (`Decision`, `Status` `Decided`, `Decided On`) and says so.
   - Run `reqs.py check`; update the overview; repeat until the human approves.
