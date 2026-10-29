# Dreamer Studio · Claude Framework

## Project Overview

- **What**: local desktop studio that uses AI to produce creative content (novels, music, video).
- **Stack**: 
  - pnpm workspaces
  - Electron 44 main + renderer
  - Angular 22 + Bootstrap reboot/utilities + Storybook 10
  - SQLite via `node:sqlite`
  - Python FastAPI (pip)
  - electron-builder zip + PyInstaller
- **Folders**: `angular/`; `electron/`; `shared/`; `backend/`; `scripts/`
- **Sources of truth**:
  - Requirements: `_docs/0.requirements-analysis.xlsx`
  - Architecture: `_docs/1.architecture-overview.html`
  - Visual design: `DESIGN.md`

> `/solo-onboard` rewrites this section from the codebase.

## Claude Framework

```
onboard ──► analysis ──► solution ──► implement
prototype   (quick path: idea ──► working code, no docs)
```

| Skill | Lead | Collaborators | Artifacts |
| --- | --- | --- | --- |
| `/solo-onboard` | architect | analyst, coder, human | `.claude/README.md`, `_docs/*` |
| `/solo-analysis <idea\|ID>` | analyst | designer, architect, human | `_docs/*` |
| `/solo-solution <ID>` | architect | analyst, designers (slice specs), coders (build slices), human | `_docs/*`, source code |
| `/solo-implement <ID>` | architect | coder, tester, human | commits, `.claude/flows/<ID>/` (plan, evidence), report |
| `/solo-prototype <idea>` | main session | Explore (haiku), coder, tester, human | uncommitted code, report |
| `tool-playwright` | tester / coder | — | UI checks with `playwright-cli`; artifacts in `.testing/.playwright-cli/` |

### Agents (`.claude/agents/`)

| Agent | Model | Owns |
| --- | --- | --- |
| analyst | opus | requirement proposals |
| designer | opus | UX, `DESIGN.md` compliance, slice specs for the Storybook prototype (several in parallel) |
| architect | opus | architecture, solutions, plans, review |
| coder | sonnet | code for one sub-step, or implement for designer |
| tester | sonnet | tests, AC verification |

### Rules

1. Skills run only when the human invokes or names them; without one, do only the task asked, no extra steps.
2. Every skill ends with a **human gate**; nothing moves on without approval.
3. Lead = main session; collaborators = sub-agents, spawned in parallel when independent.
4. Sub-agent sessions stay small: one task per spawn (one sub-step, slice, finding group or search area); the agent reports, then its session ends. Heavy work is split first; a finished agent is never reused for a new task.
5. Cheapest model that fits: haiku for search (`Explore`), sonnet for code and tests, opus only for analysis, design and architecture.
6. Requirement status: `0. Idea` → `1. Draft` → `2. Approve` (human only) → `3. Implement` → `4. Done`.
7. Implementation: one plan step = one commit; then a fix commit for review and test findings; docs commit last.

## Layout

```
.claude/
  agents/        analyst, designer, architect, coder, tester
  skills/        solo-onboard, solo-analysis, solo-solution, solo-implement, solo-prototype, tool-playwright
  scripts/       reqs.py (xlsx read/check, read-only), docs.py (new doc, serve), i18n.py (merge i18n fragments), common.py
  templates/     requirements-analysis.html, architecture-overview.html, solution.html, plan.md
    assets/      doc.css, doc.js (shared by all _docs/*.html)
  flows/<ID>/    plan.md, verification.md, screenshots, i18n/ fragments (gitignored)
  archived/      old flows and docs (gitignored)
_docs/
  0.requirements-analysis.xlsx   requirements + Open Decisions sheet (source of truth)
  0.requirements-analysis.html   read-only viewer: overview, capacities, themes, decisions
  1.architecture-overview.html   architecture
  <ID>.solution.html             solution per capacity / requirement (gitignored)
```

## Scripts

```bash
python .claude/scripts/reqs.py list --capacity TH01-03     # read (add --json)
python .claude/scripts/reqs.py check                       # validate the xlsx
python .claude/scripts/reqs.py decisions --status Open     # architecture decisions
python .claude/scripts/reqs.py next-id                     # next REQ/TSK and AD number
python .claude/scripts/docs.py new solution TH01-03 --title "App Shell"
python .claude/scripts/docs.py serve                       # http://localhost:8765/_docs/
python .claude/scripts/i18n.py merge <fragment> --prefix settings.storage.  # parallel-safe i18n keys
```

- Needs Python 3.10+ with `openpyxl`.
- HTML docs work from disk; the xlsx viewer needs `docs.py serve` (or pick the file manually).
