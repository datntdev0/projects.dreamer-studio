---
name: solo-implement
description: Architect plans the implementation of an approved solution, then drives coder and tester sub-agents in parallel through coding, review, testing and fixing, one commit per step. Use after /solo-solution is approved.
argument-hint: "<capacity or requirement ID>"
---

# solo-implement

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `coder` (implement, fix), `tester` (tests, app checks), human (two gates).
- **Artifacts**: code commits, final report to the human.
- **Flow folder** `.claude/flows/<id>/` (gitignored): `plan.md`, `verification.md`, screenshots.

## Workflow

`plan ──► propose ──► human gate ──► coding ──► review ──► testing ──► fixing ──► docs ──► human gate`

1. **Plan**
   - Read `_docs/<id>.solution.html` (must be approved) and the requirements.
   - `python .claude/scripts/docs.py new plan <id> --title "<name>"`.
   - Steps: one step = one commit, ordered by dependency.
   - Sub-steps: one agent each, with the files it owns; no shared files → run in parallel.
   - Last two steps are always **fix** (review + bug findings), then **docs** (docs, ADs, requirement status).
2. **Propose**
   - Show: steps, commits, parallel groups, ACs covered.
3. **Human gate** — approval of the plan = approval to create branch `feat/<id>` and commit each step.
4. **Coding** (per step)
   1. Spawn all sub-step `coder` agents (and `tester` for new tests) in one message.
   2. Integrate results; run lint + tests.
   3. Commit: `<type>(<scope>): <summary> [<req-id>]`; update Progress in the plan.
5. **Review**
   - Architect reviews `git diff main...HEAD` against solution, conventions, `DESIGN.md`.
   - Log findings in the plan (severity, file, fix).
6. **Testing**
   - Spawn `tester`: full test suite + UI checks with `tool-playwright`, one result per AC.
   - Tester writes the AC table to `.claude/flows/<id>/verification.md` and screenshots to `.claude/flows/<id>/`.
   - Log bugs in the plan.
7. **Fixing**
   - Spawn `coder` agents in parallel per finding group (no shared files).
   - One `fix(...)` commit; re-run review + tests on the fix. Max 2 loops, then escalate to the human.
8. **Docs** (only when every AC passes)
   - Architect updates docs to match the final code: `_docs/1.architecture-overview.html`, `.claude/README.md`, `CLAUDE.md`, ADs and requirement status via `reqs.py upsert`.
   - `reqs.py check`; one `docs(...)` commit.
9. **Human gate**
   - Report: commits, AC result table (link `verification.md`), open issues, how to run and verify.
   - Do not push or open a PR unless the human asks.
