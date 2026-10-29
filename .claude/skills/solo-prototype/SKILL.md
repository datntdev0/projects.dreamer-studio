---
name: solo-prototype
description: Quickly build a working prototype of a capability or feature idea from the human, skipping the analysis, solution and plan documents and the gates of the other solo skills. The main session splits the work into small tasks for cheap sub-agents (Explore, coder and tester). Use when the human wants to try an idea fast.
argument-hint: "<idea>"
---

# solo-prototype

- **Lead**: main session — scope, split, integrate, check.
- **Workers**: `Explore` (`model: haiku`) to locate code; `coder` (sonnet) to build; `tester` (sonnet) for one UI smoke check.
- **Artifacts**: uncommitted code in the working tree, a short report. No xlsx, `_docs`, plan file or flow folder.

## Workflow

`scope ──► split ──► build ──► check ──► human gate`

1. **Scope**
   - Idea from the human: `$ARGUMENTS`.
   - Restate it in 3–5 bullets: what the user sees, what is faked, what is left out.
   - Ask only when you cannot start (one `AskUserQuestion` round, max 2 questions); otherwise pick sensible defaults and list them.
   - Locate code: read it yourself when you know where it is; else spawn 1–3 `Explore` agents (`model: haiku`) in one message, one area each.
   - Where: the real app by default; a Storybook story in `angular/stories/pages/` when the idea is UI only.
   - On `main`: create branch `proto/<slug>` first.
2. **Split**
   - Small idea (about 3 files or fewer): build it yourself, no sub-agents.
   - Otherwise tasks of one concern each (service, IPC handler, component, slice), each with the files it owns; no file in two tasks.
   - Shared files (`shared/i18n/*.json`, `styles.scss`, routes, `scripts/check-i18n.mjs`) stay with the lead, edited after the workers finish; workers write i18n fragments in the scratchpad and merge them with `python .claude/scripts/i18n.py merge`.
   - Show the split as a short list and go on; no approval gate here.
3. **Build**
   - Spawn one fresh `coder` per task in one message. Each prompt: goal, owned files, contracts it uses or exposes (names, types), allowed fakes, "no tests, no commit".
   - Integrate the results and edit the shared files.
4. **Check**
   - `pnpm lint` and the existing tests of the touched area; fix small breaks yourself, bigger ones with one fresh `coder`.
   - UI: spawn one `tester` for a happy-path smoke check with `tool-playwright`; screenshots in the scratchpad.
5. **Human gate**
   - Report: what works, how to try it (command, route or story URL), fakes and gaps, files changed.
   - Do not commit unless asked. Next: iterate (`/solo-prototype` again), formalize (`/solo-analysis`), or discard.

## Rules

- Speed over completeness; the code still follows `CLAUDE.md` conventions, `DESIGN.md` tokens and i18n (lint enforces them).
- Fakes (fixture data, stubbed backend calls) are allowed; list each in the report, not as code comments.
- No new dependency or DB migration without asking the human.
- No opus sub-agents (`analyst`, `designer`, `architect`) unless the human asks.
- Every sub-agent is fresh, gets one task and ends when it reports.
