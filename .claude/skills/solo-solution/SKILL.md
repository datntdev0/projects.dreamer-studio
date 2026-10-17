---
name: solo-solution
description: Architect reads approved requirements and proposes a solution design in _docs/<id>.solution.html, with analyst, designer and the human. Use before implementing a capacity or functional requirement.
argument-hint: "<capacity ID THnn-nn | requirement ID REQ-nnn>"
---

# solo-solution

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `analyst` (requirement questions), `designer` (UI design), human (decisions, gate).
- **Artifact**: `_docs/<id>.solution.html`.

## Workflow

`collect ──► analyze ──► clarify ──► propose ──► human gate`

1. **Collect**
   - Requirements: `python .claude/scripts/reqs.py list --capacity <THnn-nn>` or `--id <REQ-nnn>`.
   - Warn if any requirement is not `2. Approve`; ask the human to continue or run `/solo-analysis` first.
   - `_docs/1.architecture-overview.html`, `_docs/0.architecture-decision.html`, related code, `DESIGN.md`.
2. **Analyze**
   - Map each AC to components, data, interfaces and tests.
   - Spawn in parallel (one message):
     - `designer`: UI design section (screens, states, tokens).
     - `analyst`: ambiguous or missing ACs.
   - Identify options for each non-trivial choice.
3. **Clarify**
   - Blocking questions → `AskUserQuestion`.
   - Requirement changes → `analyst` updates the xlsx via `reqs.py upsert` (status back to `1. Draft`).
4. **Propose**
   - `python .claude/scripts/docs.py new solution <id> --title "<name>"`.
   - Fill all sections; Traceability must cover every AC in scope.
   - Remaining choices → `decision` blocks with a recommended option.
5. **Human gate**
   - Show: summary, artifact path, open decisions.
   - Human answers in the HTML → **Export decisions** → pastes back; apply and repeat.
   - Approved → change the status pill to `Approved`; next step `/solo-implement <id>`.
