---
name: solo-solution
description: Architect reads approved requirements and proposes a solution design in _docs/<id>.solution.html, with analyst, designer and the human. Use before implementing a capacity or functional requirement.
argument-hint: "<capacity or requirement ID>"
---

# solo-solution

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `analyst` (requirement questions), `designer` (UX review, then prototype slices in parallel), human (decisions, gate).
- **Artifacts**: `_docs/<id>.solution.html`; Storybook prototype in `angular/stories/pages/`.

## Workflow

`collect ──► analyze ──► clarify ──► prototype ──► propose ──► human gate`

1. **Collect**
   - Requirements: `python .claude/scripts/reqs.py list --capacity <THnn-nn>` or `--id <REQ-nnn>`.
   - Warn if any requirement is not `2. Approve`; ask the human to continue or run `/solo-analysis` first.
   - `_docs/1.architecture-overview.html`, decisions (`python .claude/scripts/reqs.py decisions`), related code, `DESIGN.md`.
2. **Analyze**
   - Map each AC to components, data, interfaces and tests.
   - Spawn in parallel (one message), both read-only:
     - `designer` (review mode): screens, states, UX gaps and questions; no files written.
     - `analyst`: ambiguous or missing ACs.
   - Identify options for each non-trivial choice.
3. **Clarify** — before any prototype work
   - Merge architect, analyst and designer questions and concerns; ask them with `AskUserQuestion` (max 4 per round, options + recommendation).
   - Requirement changes → `analyst` updates the xlsx via `reqs.py upsert` (status back to `1. Draft`).
4. **Prototype** (only when the scope has UI)
   - Several IDs on one page (e.g. two capacities on one Settings page): one prototype pass for the page; each solution links it.
   - Split the UI into **slices** with no shared files (one page section, panel or dialog each).
   - Scaffold first (architect): one stub preview component per slice in a temporary folder `angular/stories/pages/<page>/` (merged into one file at integration), its `_<page>-<slice>.scss` partial imported in `styles.scss`, shared fixtures, i18n namespace in `scripts/check-i18n.mjs`, the page story that composes the slices.
   - Story files: the default export must be an object literal with a static `title` (Storybook CSF indexing), e.g. `const meta: Meta = { title: 'Pages/X', ... }; export default meta;`.
   - Start Storybook once in the background with a larger heap (`NODE_OPTIONS=--max-old-space-size=8192 pnpm storybook --ci --no-open`); parallel style edits otherwise run sass out of memory. Designers only open URLs; only the architect restarts it.
   - Spawn one `designer` per slice in one message (prototype mode). Each prompt states: owned files, story / component names, `data-testid` prefix, i18n key prefix, decisions from step 3.
   - Designers never edit shared files. i18n keys go to `.claude/flows/<id>/i18n/<slice>.json` and are merged with `python .claude/scripts/i18n.py merge <fragment> --prefix <prefix>` (safe in parallel).
   - Architect integrates: merge the slice files into one `angular/stories/pages/<page>.stories.ts` (title `Pages/<Page>`, no sub-folder, like the other pages); `pnpm lint`, `pnpm format`, stories render in light/dark and EN/VI; fixes go back to the slice owner.
   - Stories: one `Main` story where every state reachable by navigating or clicking can be seen; extra stories only for states that cannot be reached that way.
5. **Propose**
   - `python .claude/scripts/docs.py new solution <id> --title "<name>"`.
   - Fill all sections; UI Design = the designers' slice sections; Traceability must cover every AC in scope.
   - Remaining choices → `decision` blocks with a recommended option.
6. **Human gate**
   - Show: summary, artifact path, story URLs, open decisions.
   - Human answers in the HTML → **Export decisions** → pastes back; apply and repeat.
   - Approved → change the status pill to `Approved`; next step `/solo-implement <id>`.
