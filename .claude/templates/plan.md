# {{ID}} Implementation Plan

- Solution: `_docs/{{ID}}.solution.html`
- Evidence: `.claude/flows/{{ID}}/` (`verification.md`, screenshots)
- Created: {{DATE}}
- Status: proposed <!-- proposed | approved | in-progress | done -->

## Steps

<!-- One step = one commit. Sub-steps in the same step with no shared files run in parallel. -->

### Step 1 — <title>

- Commit: `feat(<scope>): <summary> [REQ-nnn]`
- Covers: REQ-nnn AC-1, AC-2
- Sub-steps:
  1. [coder-a] <task> — files: `...`
  2. [coder-b] <task> — files: `...` (parallel with 1)
  3. [tester] tests for AC-1, AC-2
- Done when: <check>

### Step N-1 — fix

- Commit: `fix(<scope>): resolve review and test findings [{{ID}}]`
- Covers: review findings + bugs from testing

### Step N — docs

- Commit: `docs(<scope>): <summary> [{{ID}}]`
- Covers: docs, ADs and requirement status match the final code (after fix; all ACs pass)
- Done when: `reqs.py check` passes

## Progress

| Step | Status | Commit | Notes |
| --- | --- | --- | --- |
| 1 | todo | | |

## Findings

| # | Source | Severity | Finding | Status |
| --- | --- | --- | --- | --- |
