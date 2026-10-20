# Dreamer Studio · Claude Framework

## Project

- **What**: local desktop studio that uses AI to produce creative content (novels, music, video).
- **Status**: skeleton (TSK-002) plus logging and error handling (TSK-003): daily log files per process in `<app data>/logs`, error banners and native error dialogs, Python backend started by main; portable Windows x64 zip via `pnpm package` (TSK-004); SQLite database and data access layer in main (TSK-005); schema migrations on startup (TSK-006); app data folders, single-instance lock and path lint rule (TSK-007); pipeline executor in main: `pipeline_run` table, queue limited by the max concurrent setting (REQ-009), cancel, run logs, recover on start and cancel on quit, `pipeline:*` IPC (TSK-008); dev-only demo pipeline whose step 3 runs as a streaming Python job (`POST /jobs/{type}`, NDJSON) (TSK-009); typed IPC errors `{ value } | { error }` (AD-35); pipeline monitor: status bar indicator, toasts, `/pipelines` with Queue tab, Start dialog, details and live log (REQ-004); pipeline history: History tab with filters, paging, delete, Home recent runs, pipeline stories on the real page with a fake `DesktopApi` (REQ-005); settings file: `%LOCALAPPDATA%/DreamerStudio/settings.json` read and sanitized at startup (`.bak` for an unreadable file), app data root and main language from it, startup dialog when the app data folder is unavailable, `settings:get` + startup notice toast (TSK-010); settings screen: `/settings` with General (language, theme), Pipelines (slider 1–5, used by the executor at once, REQ-009), App data folder (path, copy, Explorer) and a Diagnostics & about placeholder, auto-save through `settings:update | reset` with validation and per-section reset, `settings:changed` push, saved theme + language applied at startup (REQ-006); app data folder switch without restart: `AppDataSession` / `AppDataManager` (getter, inspect, switch with rollback, status), `app-data:*` IPC, Settings › App data folder with status line, review dialog, blocking popup, blocked state and Storage reset (REQ-008); top bar language and theme toggles save to settings, window background follows the saved theme, `app:set-language` removed (main language follows settings changes) (REQ-007); design system in Storybook: tokens, fonts, icons, base components, layout patterns (REQ-001); app shell (top bar, rail, status bar, toasts), module registry + routes, Coming soon page, homepage, light/dark theme, shell and homepage stories (REQ-003); i18n: `shared/i18n/{en,vi}.json`, runtime EN/VI switch, translated native dialogs, `check-i18n` in lint (REQ-002).
- **Releases**: `0.0.0` foundation (approved) · `0.1.0` novel library (draft) · `0.2.0` AI analysis (draft).
- **Stack**: Electron 44 main + renderer (esbuild, electron-log) · Angular 22 + Bootstrap reboot/utilities + Storybook 10 · Python FastAPI (pip) · SQLite via `node:sqlite` · pnpm workspaces · PyInstaller + electron-builder zip.
- **Processes**: renderer (UI) ──IPC──► main (core services, DB, pipeline executor) ──HTTP──► Python (AI jobs, stateless).
- **Folders**: `angular/src/<core|components|shell|features|styles>`, `angular/stories` · `electron/main`, `electron/preload` · `shared/<ipc|errors>` · `backend/app` · `scripts/` (`dev.mjs`, `py.mjs`, `build.mjs`).
- **Decisions**: AD-01..13, AD-18..37 decided, AD-14..17 deferred — `python .claude/scripts/reqs.py decisions`.
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
| `/solo-solution <ID>` | architect | analyst, designers (parallel prototype slices), human | `_docs/<ID>.solution.html`, Storybook prototype |
| `/solo-implement <ID>` | architect | coder, tester, human | commits, `.claude/flows/<ID>/` (plan, evidence), report |
| `tool-playwright` | tester / coder | — | UI checks with `playwright-cli` |

### Agents (`.claude/agents/`)

| Agent | Model | Owns |
| --- | --- | --- |
| analyst | opus | requirements xlsx |
| designer | opus | UX, `DESIGN.md` compliance, Storybook prototype slices (several in parallel) |
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
  scripts/       reqs.py (xlsx read/check/upsert), docs.py (new doc, serve), i18n.py (merge i18n fragments), common.py
  templates/     architecture-decision.html, architecture-overview.html, solution.html, plan.md
  flows/<ID>/    plan.md, verification.md, screenshots, i18n/ fragments (gitignored)
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
python .claude/scripts/i18n.py merge <fragment> --prefix settings.storage.  # parallel-safe i18n keys
```

- Needs Python 3.10+ with `openpyxl`.
- HTML docs work from disk; the two xlsx viewers need `docs.py serve` (or pick the file manually).
