# Dreamer Studio · Claude Framework

## Project

- **What**: local desktop studio that uses AI to produce creative content (novels, music, video).
- **Status**: pre-code. Requirements exist; architecture not decided yet (TSK-001).
- **Releases**: `0.0.0` foundation · `0.1.0` novel library · `0.2.0` AI analysis.
- **Sources of truth**:
  - Requirements: `_docs/0.requirements-analysis.xlsx`
  - Visual design: `DESIGN.md`
  - Architecture: `_docs/1.architecture-overview.html` (after `/solo-onboard`)

> `/solo-onboard` rewrites this section from the codebase.

## Framework

```
onboard ──► analysis ──► solution ──► implement
```

| Skill | Lead | Collaborators | Artifacts |
| --- | --- | --- | --- |
| `/solo-onboard` | architect | analyst, coder, human | `.claude/README.md`, `_docs/1.architecture-overview.html`, `_docs/0.architecture-decision.html` |
| `/solo-analysis <idea\|ID>` | analyst | designer, architect, human | `_docs/0.requirements-analysis.xlsx` |
| `/solo-solution <ID>` | architect | analyst, designer, human | `_docs/<ID>.solution.html` |
| `/solo-implement <ID>` | architect | coder, tester, human | commits, `_docs/<ID>.plan.md`, report |
| `tool-playwright` | tester / coder | — | UI checks with `playwright-cli` |

### Agents (`.claude/agents/`)

| Agent | Model | Owns |
| --- | --- | --- |
| analyst | opus | requirements xlsx |
| designer | opus | UX, `DESIGN.md` compliance |
| architect | opus | architecture, solutions, plans, review |
| coder | sonnet | code for one sub-step |
| tester | sonnet | tests, AC verification |

### Rules

1. Every skill ends with a **human gate**; nothing moves on without approval.
2. Lead = main session; collaborators = sub-agents, spawned in parallel when independent.
3. Requirement status: `0. Idea` → `1. Draft` → `2. Approve` (human only).
4. Implementation: one plan step = one commit; last commit fixes review and test findings.

## Layout

```
.claude/
  agents/        analyst, designer, architect, coder, tester
  skills/        solo-onboard, solo-analysis, solo-solution, solo-implement, tool-playwright
  scripts/       reqs.py (xlsx read/check/upsert), docs.py (new doc, serve), common.py
  templates/     architecture-decision.html, architecture-overview.html, solution.html, plan.md
    assets/      doc.css, doc.js (shared by all _docs/*.html)
_docs/
  0.requirements-analysis.xlsx   requirements (source of truth)
  0.requirements-analysis.html   view-only viewer of the xlsx
  0.architecture-decision.html   open architecture questions
  1.architecture-overview.html   architecture
  <ID>.solution.html             solution per capacity / requirement
  <ID>.plan.md                   implementation plan
```

## Scripts

```bash
python .claude/scripts/reqs.py list --capacity TH01-03     # read (add --json)
python .claude/scripts/reqs.py check                       # validate the xlsx
python .claude/scripts/reqs.py next-id                     # next REQ/TSK number
python .claude/scripts/reqs.py upsert patch.json           # write changes
python .claude/scripts/docs.py new solution TH01-03 --title "App Shell"
python .claude/scripts/docs.py serve                       # http://localhost:8765/_docs/
```

- Needs Python 3.10+ with `openpyxl`.
- HTML docs work from disk; the xlsx viewer needs `docs.py serve` (or pick the file manually).
