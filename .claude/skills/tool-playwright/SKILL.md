---
name: tool-playwright
description: Drive the running application in a browser with playwright-cli (open, snapshot, click, fill, verify, screenshot) to support testing tasks. Use when a tester or coder must check UI behavior or an acceptance criterion in the real app.
allowed-tools: Bash(playwright-cli:*)
---

# tool-playwright

- Full command list: `playwright-cli --help`.
- Element targets are refs (`e15`) from the latest snapshot.

## Workflow

1. **Set artifact directory** — before the first command in each shell, run `export PLAYWRIGHT_MCP_OUTPUT_DIR=.testing/.playwright-cli`; this keeps Playwright CLI snapshots, logs, traces, and other generated artifacts under `.testing/.playwright-cli`.
2. **Start the app** — dev command from `_docs/1.architecture-overview.html` (Conventions › Commands), run in background; note the URL.
3. **Open**
   - Web UI: `playwright-cli open <url>`
   - Desktop app with a debug port (Electron / WebView2): `playwright-cli attach --cdp=http://localhost:9222`
   - Parallel testers: name the session, e.g. `playwright-cli -s=tester-1 open <url>`.
4. **Inspect** — `playwright-cli snapshot` (add `--depth=4` on big pages).
5. **Act** — `click e3`, `fill e5 "text" --submit`, `select e9 value`, `press Enter`, `hover e4`, `upload <file>`.
6. **Verify**
   - Snapshot again and compare, or `playwright-cli --raw eval "document.title"`.
   - Errors: `playwright-cli console error`, `playwright-cli requests`.
   - Theme: `playwright-cli --raw eval "document.documentElement.dataset.theme"`.
7. **Evidence** — `playwright-cli screenshot --filename=.testing/.playwright-cli/<capability-or-spec-id>-scenario<n>.png`.
8. **Close** — `playwright-cli close` (or `-s=<name> close`); stop the dev server.

## Rules

- Re-snapshot after every navigation or re-render; refs change.
- Check light and dark themes, VN and EN, when the scenario or intent touches UI text or color.
- Report per scenario or intent: steps, expected, actual, screenshot path.
