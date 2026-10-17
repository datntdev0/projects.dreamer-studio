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
  - `_docs/0.architecture-decision.html` — only when architecture questions are open (e.g. greenfield)

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
   - Create docs: `python .claude/scripts/docs.py new architecture-overview` (and `architecture-decision` if questions are open).
   - Fill each section with facts; mark guesses `[unverified]`.
   - Update the project section of `.claude/README.md` and the commands in `CLAUDE.md`.
4. **Human gate**
   - Show: 5-line summary, artifact paths, open questions.
   - Human answers decisions in the HTML → **Export decisions** → pastes back.
   - Apply answers (set `data-decided`, update overview), repeat until the human approves.
