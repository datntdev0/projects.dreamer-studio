# Dreamer Studio · Claude Framework

## Project

- **What**: local desktop studio that uses AI to produce creative content (novels, music, video).
- **Status**: skeleton (TSK-002) plus logging and error handling (TSK-003): daily log files per process in `<app data>/logs`, error banners and native error dialogs, Python backend started by main; portable Windows x64 zip via `pnpm package` (TSK-004). Next: TH01-02 (database), TH01-03 (shell, design system).
- **Releases**: `0.0.0` foundation (approved) · `0.1.0` novel library (draft) · `0.2.0` AI analysis (draft).
- **Stack**: Electron 44 main + renderer (esbuild, electron-log) · Angular 22 + Bootstrap · Python FastAPI (pip) · SQLite via `node:sqlite` · pnpm workspaces · PyInstaller + electron-builder zip.
- **Processes**: renderer (UI) ──IPC──► main (core services, DB, pipeline executor) ──HTTP──► Python (AI jobs, stateless).
- **Folders**: `angular/src/<core|components>` · `electron/main`, `electron/preload` · `shared/<ipc|models|errors|core>` · `backend/app` · `scripts/` (`dev.mjs`, `py.mjs`, `build.mjs`).
- **Decisions**: AD-01..13, AD-18..21 decided, AD-14..17 deferred — `python .claude/scripts/reqs.py decisions`.
- **Sources of truth**:
  - Requirements: `_docs/0.requirements-analysis.xlsx`
  - Visual design: `DESIGN.md`
  - Architecture: `_docs/1.architecture-overview.html`
  - Decisions: sheet `Open Decisions` in the xlsx (viewer `_docs/0.architecture-decision.html`)

> `/solo-onboard` rewrites this section from the codebase.

## Framework

```
onboard ──► analysis ──► solution ──► implement
```

| Skill | Lead | Collaborators | Artifacts |
| --- | --- | --- | --- |
| `/solo-onboard` | architect | analyst, coder, human | `.claude/README.md`, `_docs/1.architecture-overview.html`, xlsx `Open Decisions` |
| `/solo-analysis <idea\|ID>` | analyst | designer, architect, human | `_docs/0.requirements-analysis.xlsx` |
| `/solo-solution <ID>` | architect | analyst, designer, human | `_docs/<ID>.solution.html` |
| `/solo-implement <ID>` | architect | coder, tester, human | commits, `.claude/flows/<ID>/` (plan, evidence), report |
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
3. Requirement status: `0. Idea` → `1. Draft` → `2. Approve` (human only) → `3. Implement` → `4. Done`.
4. Implementation: one plan step = one commit; then a fix commit for review and test findings; docs commit last.

## Layout

```
.claude/
  agents/        analyst, designer, architect, coder, tester
  skills/        solo-onboard, solo-analysis, solo-solution, solo-implement, tool-playwright
  scripts/       reqs.py (xlsx read/check/upsert), docs.py (new doc, serve), common.py
  templates/     architecture-decision.html, architecture-overview.html, solution.html, plan.md
  flows/<ID>/    plan.md, verification.md, screenshots (gitignored)
    assets/      doc.css, doc.js (shared by all _docs/*.html)
_docs/
  0.requirements-analysis.xlsx   requirements + Open Decisions sheet (source of truth)
  0.requirements-analysis.html   view-only viewer of the requirement sheets
  0.architecture-decision.html   viewer of the Open Decisions sheet; human picks and exports
  1.architecture-overview.html   architecture
  <ID>.solution.html             solution per capacity / requirement
```

## Scripts

```bash
python .claude/scripts/reqs.py list --capacity TH01-03     # read (add --json)
python .claude/scripts/reqs.py check                       # validate the xlsx
python .claude/scripts/reqs.py decisions --status Open     # architecture decisions
python .claude/scripts/reqs.py next-id                     # next REQ/TSK and AD number
python .claude/scripts/reqs.py upsert patch.json           # write changes
python .claude/scripts/docs.py new solution TH01-03 --title "App Shell"
python .claude/scripts/docs.py serve                       # http://localhost:8765/_docs/
```

- Needs Python 3.10+ with `openpyxl`.
- HTML docs work from disk; the two xlsx viewers need `docs.py serve` (or pick the file manually).
