---
name: solo-implement
description: Architect plans the implementation of an approved solution, then drives coder and tester sub-agents in parallel through coding, review, testing and fixing, one commit per step. Use after /solo-solution is approved.
argument-hint: "<Capability ID or L2 Spec ID>"
---

# solo-implement

- **Lead**: `architect` — the main session follows `.claude/agents/architect.md`.
- **Collaborators**: `coder` (implement, fix), `tester` (tests, app checks), human (two gates).
- **Artifacts**: code commits, final report to the human.
- **Flow folder** `.claude/flows/<id>/` (gitignored): `plan.md`, `verification.md`, screenshots.

## Workflow

`plan ──► propose ──► human gate ──► coding ──► review ──► testing ──► fixing ──► docs ──► human gate`

1. **Plan**
   - Read `_docs/<id>.solution.html` (must be approved), the linked L1 Capability, and relevant L2 specs.
   - `python .claude/scripts/docs.py new plan <id> --title "<name>"`.
   - Steps: one step = one commit, ordered by dependency.
   - Sub-steps: one agent each, with the files it owns; no shared files → run in parallel.
   - Size: a sub-step fits one short agent session (one concern, a few files); split bigger ones.
   - Last two steps are always **fix** (review + bug findings), then **docs** (docs, ADRs, capability and L2 status).
2. **Propose**
   - Show: steps, commits, parallel groups, and the L2 scenarios or L1 intent each step verifies.
3. **Human gate** — approval of the plan = approval to create branch `feat/<id>` and commit each step.
4. **Coding** (per step)
   1. Spawn a fresh `coder` per sub-step (and `tester` for new tests) in one message; never reuse an agent from an earlier step.
   2. Integrate results; run lint + tests.
   3. Commit: `<type>(<scope>): <summary> [<Capability ID>]`; update Progress in the plan.
5. **Review**
   - Architect reviews `git diff main...HEAD` against solution, conventions, `DESIGN.md`.
   - Log findings in the plan (severity, file, fix).
6. **Testing**
   - Run the full test suite yourself; use `tester` for UI checks against the relevant L2 scenarios or direct L1 intent, with named sessions.
   - Tester records the verification basis and results in `.claude/flows/<id>/verification.md` and screenshots in `.claude/flows/<id>/`.
   - Log bugs in the plan.
7. **Fixing**
   - Spawn a fresh `coder` per finding group, in parallel (no shared files).
   - One `fix(...)` commit; re-run review + tests on the fix. Max 2 loops, then escalate to the human.
8. **Docs** (only when all planned verification passes)
   - Architect updates docs to match the final code: `_docs/1.architecture-overview.html`, `.claude/README.md`, `CLAUDE.md`; propose ADR, capability status, and L2 status changes as a table.
   - One `docs(...)` commit.
9. **Human gate**
   - Report: commits, verification results (link `verification.md`), open issues, how to run and verify.
   - Do not push or open a PR unless the human asks.
