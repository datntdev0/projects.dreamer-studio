---
name: solo-analysis
description: Analyst clarifies, analyzes and proposes capability or Level 2 specification changes for _docs/0.requirements-analysis.xlsx, with designer, architect and the human. Use for a new idea, theme, capability, or feature/change.
argument-hint: "<idea | theme | Capability ID | feature/change>"
---

# solo-analysis

- **Lead**: `analyst` — the main session follows `.claude/agents/analyst.md`.
- **Collaborators**: `designer` (UX gaps), `architect` (feasibility, technical tasks), human (answers, gate).
- **Artifact**: proposed changes for `_docs/0.requirements-analysis.xlsx` (view: `_docs/0.requirements-analysis.html`).

## Workflow

`collect ──► analyze ──► clarify ──► propose ──► human gate`

1. **Collect**
   - Input from the human: `$ARGUMENTS`.
   - Current state: `python .claude/scripts/reqs.py list --id <THnn | THnn-nn | L2-THnn>`.
   - Related capacities and dependencies; `_docs/1.architecture-overview.html` if it exists.
2. **Analyze**
   - Refine progressively: theme > capability intent > Level 2 feature/change spec when complexity warrants it > executable spec in source.
   - Find gaps, overlaps, conflicts, dependencies, release fit.
   - Spawn in parallel (one message):
     - `designer`: UX gaps and missing UI states.
     - `architect`: feasibility, risks, and source contracts or schemas needed.
3. **Clarify**
   - Ask only blocking questions with `AskUserQuestion` (max 4 per round, options + recommendation).
   - Repeat until scope, release and priority are clear.
4. **Propose**
   - Write the proposed changes as a table (ID, sheet, column, current → new, full text for new rows); new rows get status `1. Draft`; new L2 IDs from `reqs.py next-id --capability THnn-nn`.
5. **Human gate**
   - Show the proposed changes table.
   - Run `reqs.py check` and report issues.
   - Only the human sets status `2. Approve`.
   - Changes requested → back to step 2.
