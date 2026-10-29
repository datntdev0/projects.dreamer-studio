---
name: solo-analysis
description: Analyst clarifies, analyzes and proposes final requirements for _docs/0.requirements-analysis.xlsx, with designer, architect and the human. Use for a new idea, theme, capacity or requirement change.
argument-hint: "<idea | theme | capacity ID | requirement ID>"
---

# solo-analysis

- **Lead**: `analyst` — the main session follows `.claude/agents/analyst.md`.
- **Collaborators**: `designer` (UX gaps), `architect` (feasibility, technical tasks), human (answers, gate).
- **Artifact**: proposed changes for `_docs/0.requirements-analysis.xlsx` (view: `_docs/0.requirements-analysis.html`).

## Workflow

`collect ──► analyze ──► clarify ──► propose ──► human gate`

1. **Collect**
   - Input from the human: `$ARGUMENTS`.
   - Current state: `python .claude/scripts/reqs.py list --id <THnn | THnn-nn | REQ-nnn>`.
   - Related capacities and dependencies; `_docs/1.architecture-overview.html` if it exists.
2. **Analyze**
   - Break down top-down: theme > capacity > requirement > AC.
   - Find gaps, overlaps, conflicts, dependencies, release fit.
   - Spawn in parallel (one message):
     - `designer`: UX gaps and missing UI states.
     - `architect`: feasibility, risks, needed `TSK-` items.
3. **Clarify**
   - Ask only blocking questions with `AskUserQuestion` (max 4 per round, options + recommendation).
   - Repeat until scope, release and priority are clear.
4. **Propose**
   - Write the proposed changes as a table (ID, sheet, column, current → new, full text for new rows); new rows get status `1. Draft`; new IDs from `reqs.py next-id`.
5. **Human gate**
   - Show the proposed changes table.
   - Run `reqs.py check` and report issues.
   - Only the human sets status `2. Approve`.
   - Changes requested → back to step 2.
