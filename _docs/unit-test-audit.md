# Unit test audit against L1/L2 requirements

## Acceptance-unit implementation (2026-10-31)

Read the **Acceptance Scenarios**, **Invariants & Contracts**, and **Migration & Edge Cases** columns from `_docs/0.requirements-analysis.xlsx`. The current workbook contains 20 L2 specifications. The historical inventory below is retained as audit context; it is not a claim that every scenario is now covered.

The requested acceptance-unit layer now uses `angular/tests/<CapabilityID>/<SpecID>.spec.ts` and `electron/tests/<CapabilityID>/<SpecID>.spec.ts`. Existing colocated `.test.ts` suites remain in place. Angular acceptance tests drive production components and unchanged templates, using real services/stores with a fake DesktopApi boundary; Electron tests exercise production services, pipelines, package readers/writers, temporary files and SQLite. They do not launch Electron or installed CLIs. Shared fixtures are in each `tests/support/` directory. Import the Electron fixture before production modules so its Electron, logging and broadcast mocks are registered before module initialization.

| Spec | Angular evidence added | Electron evidence added |
|---|---|---|
| L2-TH01-01-01 | Production Root/Shell render unhandled-error banners; repeated errors coalesce; real open-logs and dismiss controls invoke their boundaries. | Root package version/author feed compiled build identity; main/preload build entry contract; time/level/process/stack formatting and app-data log retention. Clean checkout/package launch remain integration checks. |
| L2-TH01-02-01 | — | Fresh startup folders/database; ordered, once-only upgrades; backup of populated data; failed/unknown migrations stop startup and leave prior data readable. |
| L2-TH01-03-01 | Production GeneralSection/Topbar controls update language/theme through real services; settings events refresh controls; Rail renders English fallback and logs missing keys once. | — |
| L2-TH01-04-01 | Production HomePage/StatusBar render pipeline event progress/history; actual completion toast action opens the matching run; deletion removes the rendered history. | Queue/slot scheduling; persisted progress; cancellation and cleanup; restart recovery; finished history/log deletion; concurrency increases/decreases (also L2-TH02-01-01 AC6). |
| L2-TH02-01-01 | Production PipelineSection range controls persist valid changes, restore their value after a rejected update and render failure feedback; settings events update controls without duplicate subscriptions. | Persist preferences across settings instances; empty/existing folder switches; preserve the old database; missing target and failed upgrade rollback; active-work guard. |
| L2-TH02-02-01 | About release/runtime identity and repository action; bug-report copy success/failure; missing metadata fallback. | Registered built-in health checks report OK/Warning/Error and suggested fixes; throwing/timed-out checks are isolated; reruns evaluate fresh context without accumulating results. |
| L2-TH02-03-01 | — | Supported CLI detection/version and events; custom path validation/persistence with invalid replacement refused; connection success/coded failure; feature override/default resolution; disappearance blocks execution. Detection/process boundaries are faked; installed CLI compatibility remains integration. |
| L2-TH03-01-01 | Production ImportPage picker/preview/edit/confirm submits edited metadata; preview cancellation returns to source without import; real drop handler refuses non-ZIP files. | Read-only preview; edited metadata/chapter selection; repeated imports get distinct IDs; corrupt archive refusal; changed-package rejection; cancellation and injected disk-write failure clean staging. |
| L2-TH03-02-01 | Production `LibraryPage`, `LibraryItemsComponent`, `LibraryInspectorComponent` and panel outlets render their unchanged templates with real stores. Tests use actual search/filter/sort controls, card selection, inspector cover/metadata/counts/synopsis and open/folder actions, empty/no-result actions, and pipeline-driven pending/completed imports. Only DesktopApi and navigation side effects are faked. Renderer file-service security still requires integration tests. | — |
| L2-TH03-02-02 | Production LibraryPage metadata form saves into list/inspector; required-field and invalid-cover feedback retain the draft; cover replacement/removal refreshes inspector; unsaved-selection dialog supports keep editing/discard. | Valid metadata updates list/detail and survives a fresh session; invalid required fields/cover bytes leave metadata unchanged; replace/remove cover persists and cleans owned files without deleting the source image. |
| L2-TH03-02-03 | — | Export current chapter order/content and import into a separate empty library; failed/cancelled export removes partial output and preserves an existing destination; bulk deletion skips locked novels. |
| L2-TH03-03-01 | Production NovelPage reader renders first chapter/pager boundaries, missing-file retry and keyboard suppression. Colocated tests cover selected search-hit highlighting and focus-mode panels. | — |
| L2-TH03-03-02 | Production NovelPage organize controls, selection and move/merge dialogs submit chapter changes; rendered order updates on save and remains unchanged for lock/stale-selection/missing-file failures. | — |
| L2-TH03-03-03 | Production NovelPage editor saves normalized edits into reader, renders empty-field validation, confirms keep/discard of dirty edits, and retains draft with visible lock refusal. | — |
| L2-TH04-01-01 | — | Block invalid ontology/unavailable LLM/no eligible chapters; selected range and overwrite planning; retain completed output after isolated timeout or cancellation. |
| L2-TH04-01-02 | — | Review invalid quotes with source chapter context; preview and persist corrected quotes; revalidate issues; fresh chapter results replace old review. **Explicit merge is not implemented/tested.** |
| L2-TH04-01-03 | — | Chapter-boundary/single-chapter views and occurrences; persisted overlay survives regenerated chapter results and becomes an explicit orphan if its target disappears. |
| L2-TH04-05-01 | Production TranslationPage target controls, instruction panel and reset confirmation preserve per-language values; actual glossary inputs/buttons edit and clear entries; no-analysis UI links to analysis. | — |
| L2-TH04-05-02 | Production glossary-run dialog controls pass identical scope/language/batch/instruction to plan/start, close after success, and retain configuration with visible failure feedback. | Eligible selection, aliases grouped with their entity, automatic saves preserve user-authored values, completed batches and summary counts survive cancellation. |
| L2-TH04-05-03 | Production NovelPage original/translation/side controls ignore obsolete translation responses; actual TranslationPage content-run dialog passes identical overwrite/range/instruction to plan/start. | Persist validation issues/user edits; source/glossary staleness versus instruction-only changes; protect current user edits without overwrite; explicit overwrite; retain completed chapters after timeout/cancellation. |

### Known requirement gaps

- **L2-TH04-05-03, user-edited stale translations:** `contentRunQueue` currently queues stale user edits even with `overwrite: false`. The Electron spec contains a named `it.fails` regression test for the required protection. Vitest reports this as **expected fail**, not a verified requirement. Remove `.fails` when the implementation is corrected. Product behavior was not changed as part of this test-only task.
- **L2-TH04-01-02 AC3/4 and L2-TH04-01-03 merge invariant:** `AnalysisService` has no explicit merge/accept-warning operation. Its snapshot derives the world directly from chapter results and overlays. Tests prove revalidation and overlay persistence; they do not assert an unavailable merge transaction or error gate.
- Other unlisted scenarios retain their colocated unit evidence or still require integration/E2E as described below. Native dialogs, packaged startup, real CLI compatibility, app relaunch, full IPC journeys and destructive-action confirmation are not established by these unit tests. Export round-trip covers metadata and chapters; the optional-cover round-trip remains a gap in this new layer.

### Running the suites

- All Electron/shared unit suites: `pnpm exec vitest run`.
- New Electron acceptance-unit suites only: `pnpm exec vitest run electron/tests`.
- Angular (existing and new suites): `pnpm --filter @dreamer/angular test`.
- Electron type check, including the new tests: `pnpm exec tsc -p electron/tsconfig.json`.
- Focused lint: `pnpm exec eslint electron/tests angular/tests`.

On Windows PowerShell with script execution disabled, use `pnpm.cmd` in place of `pnpm`. Root Vitest discovery includes Electron `.spec.ts`; Angular CLI discovery and its spec tsconfig include `angular/tests`. The acceptance-unit layer has **14 Electron suites and 14 Angular suites**. Comparing the workbook's Spec IDs with both test directories confirms **20/20 L2 specs have at least one corresponding `.spec.ts`**, with no missing or unknown IDs. This is file-level traceability, not proof that all acceptance scenarios are verified end to end.

Validation on 2026-10-31: the root Electron/shared run completed with **40 files, 353 passed tests and 1 expected failure**; Angular completed with **25 files and 66 passed tests**. Electron TypeScript checking, focused ESLint, Prettier checking, and `git diff --check` passed. These results include existing suites. The Electron acceptance-unit layer contributes 54 passing cases and 1 expected-failure case. Python/backend and packaged/E2E checks were not run for this change.

Angular component-test policy: prefer production components and their unchanged production templates across both `src/**/*.test.ts` and `tests/**/*.spec.ts`. Test-only components, host templates and template overrides are allowed only when testing the actual component is technically impossible, with the specific reason documented beside the exception. The current audit found and removed the library browse template override, the novel focus-mode host, and the empty theme-service host; no exceptions remain. Production panel outlets are mounted as separate fixtures sharing the real layout service, and service-only tests use direct injection without an empty host component.

### Angular component review (2026-10-31)

The review found that removing synthetic templates alone was insufficient: several L2 suites still invoked stores or editor methods directly and could pass with broken template bindings. Those suites now interact with actual production pages, controls, dialogs and panel outlets, assert the DesktopApi request, and verify the rendered result or refusal. This includes library metadata/cover, chapter navigation/organizing/editing, import, settings, pipeline notifications, and translation instructions/glossary/content runs.

Colocated reader, translation, review, layout, rail and topbar tests also now exercise production components with real collaborator services. Review filters verify rendered source context through the real OmniscientStore; layout tests register/unregister real panel directives. Focused theme-service and route-builder unit tests remain as supplementary contract tests, rather than acceptance-scenario evidence by themselves.

`angular/tests/support/desktop-fixture.ts` centralizes typed DesktopApi fakes and mounts production toast/confirmation/panel components. Browser-only adapters cover JSDOM's missing dialog, resize and scrolling APIs. Fixtures remain attached to the document for native checkbox/radio events, and teardown cancels toast timers and pending animation frames. No test component, synthetic host template or template override is used.

The final Angular review run passed **25 files / 66 tests**. ESLint passed for `angular/tests` and `angular/src`. These are component integration tests within Angular; actual Electron IPC, native OS dialogs and packaged execution still require integration/E2E checks.

## Scope and classification

Static review of the original `*.test.ts` and `backend/tests/test_*.py` suite against `_docs/0.requirements-analysis.xlsx` (12 L1 capabilities, 18 L2 specifications). The original suite was later curated to the target inventory below: tests outside that inventory were removed, and focused tests were added for translation rules, adapter contracts, package metadata and reader selection. Tests were not executed. “Covered” means an automated test asserts the relevant behavior at a unit/service/store boundary; it does not mean the complete user journey has been verified.

1. **Component/function tests** — verify a component, pure function, store, repository, service, or pipeline module in isolation. Examples: parsing settings, chapter changes, repository persistence, pipeline planning, and Angular page rendering with a stub API.
2. **Acceptance scenario tests** — exercise enough production modules together to assert a scenario stated in L1/L2. Existing tests in this group are still mostly service/pipeline tests with fakes; no dedicated E2E suite or Electron/browser journey tests were found.

One test can serve both purposes. A test asserting a service/pipeline outcome is an acceptance-scenario test only for the part of the requirement it actually exercises.

## L1 capability roll-up

The coverage tables below describe the original test suite before curation and before the proposed replacement suites were added. The current target inventory and naming rules are in **Proposed coverage**.

| L1 capability | L2 evidence summary |
|---|---|
| TH01-01 Project Structure and Codebase | Partial; logging/version functions tested, packaged app and full workflow not. |
| TH01-02 Local Data Storage | Strong service-level coverage; release-like upgrade/restart still needs integration validation. |
| TH01-03 Application Shell and Homepage | Partial; routes/home states tested, live shell behavior needs UI/E2E. |
| TH01-04 Application Pipeline Management | Partial; executor and selected page flows tested, cross-process recovery/notifications need E2E. |
| TH02-01 General Settings | Partial; settings/storage contracts tested, immediate UI effects and relaunch need E2E. |
| TH02-02 Diagnostics and About | Diagnostics engine/checks covered; About presentation/copy flow is partial. |
| TH02-03 LLM Integrations | Partial; choice resolution and runner tested, installed CLI detection/connection flow not. |
| TH03-01 Novel Import | Strong reader/import-pipeline coverage; complete UI flow needs E2E. |
| TH03-02 Novel Operations | Partial; search/edit/delete pieces tested; export and complete UI journeys are gaps. |
| TH03-03 Novel Detail and Reader | Chapter manipulation functions covered; reader/editor interaction scenarios are partial. |
| TH04-01 Novel World Analysis | Strong analysis logic/pipeline coverage; full review/merge/explore UI flow is partial. |
| TH04-05 Novel Translation | No translation-specific automated tests found. |


## Acceptance scenario coverage by L2

| L2 | Existing tests that provide evidence | Assessment against acceptance scenarios | Not verified by unit tests / E2E or integration needed |
|---|---|---|---|
| **L2-TH01-01-01** Build and package foundation | `electron/esbuild.test.ts`; `electron/main/logging/{log-format,log-files}.test.ts`; backend `test_log.py`, `test_jobs.py` | Partial: version source and log formatting/retention have function tests; backend job/error behavior has component tests. | Fresh-checkout build/check/package; launch extracted package on clean Windows; app-wide unhandled-error logging and user-facing state. Build/package and packaged-launch checks need CI/integration or manual E2E. |
| **L2-TH01-02-01** Persist local data across launches/upgrades | `electron/main/storage/{paths,migrator}.test.ts`; `storage/repositories/*.test.ts`; `electron/main/app/app-data-manager.test.ts` | Strong service-level acceptance coverage for folder initialization/switch, migration, backup/rollback and operational record persistence. | Actual app startup/restart and real upgrade continuity across packaged versions; verify complete folder layout and real SQLite backup/restore in release-like conditions. |
| **L2-TH01-03-01** Shell and homepage | `angular/src/shell/shell.routes.test.ts`; `features/home/home.page.test.ts`; `shared/i18n/translate.test.ts`; settings page tests | Partial: route construction, coming-soon route mapping, home data/empty state and dictionary fallback are tested separately. | User navigation through shell, live language/theme change with persistence, shell notifications/activity reacting while open, notification destination. Needs UI/E2E coverage; language/theme persistence may also use store/service acceptance tests. |
| **L2-TH01-04-01** Run, monitor, recover pipelines | `electron/main/features/pipelines/pipeline-executor.test.ts`; run repository tests; `electron/main/backend/backend-job.test.ts`; Angular pipeline page/store tests | Partial to good for executor state/progress/cancel/history and page list/filter/open/delete behavior. | App quit/restart cancellation, end-to-end slot behavior with multiple real workers, log deletion/retention wiring, completion notification opening run details. Multi-process/Electron E2E needed. |
| **L2-TH02-01-01** Settings and app-data switch | `shared/models/settings.test.ts`; `electron/main/features/settings/settings-store.test.ts`; `electron/main/app/app-data-manager.test.ts`; Angular settings page tests | Partial: validation/persistence and app-data switching behavior have component/service coverage; UI tests mainly assert rendered sections. | Immediate language/theme/pipeline setting effects across the running app; full folder-picker flow and visible failure reason; persistence after relaunch. UI/Electron E2E needed. |
| **L2-TH02-02-01** About and diagnostics | `electron/main/features/diagnostics/{self-check-engine,built-in-checks}.test.ts`; settings page test | Strong for independent checks, statuses, timeout/throw isolation and suggested diagnostic outcomes. About view only has limited page-render coverage. | About identity/version/build date/license/link and copy-for-bug-report behavior; full diagnostics UI flow and fresh rerun visible to user. Browser/Electron UI tests needed. |
| **L2-TH02-03-01** Local LLM choices | `shared/models/llm.test.ts`; `shared/models/settings.test.ts`; `electron/main/features/llm/llm-runner.test.ts`; analysis LLM tests | Partial: choice resolution, fallback, invalid configuration, runner outcomes and analysis retries have component tests. | CLI detection/version/custom path/connection test on supported OS installations; feature settings UI and run blocked when CLI later disappears. Requires adapter integration with installed CLI plus UI/E2E. |
| **L2-TH03-01-01** Import a novel package | `electron/main/features/library/package-reader.test.ts`; `novel/novel-import-pipeline.test.ts`; `angular/src/features/library/import/import.page.test.ts` | Strong service-level coverage for package validation, preview read-only behavior, import, duplicate imports, cancellation and staging cleanup. | Complete edit-preview-confirm journey, progress/error presentation, and filesystem failure behavior through the actual UI. E2E for UI-to-filesystem wiring; package reader and pipeline tests already cover underlying contracts. |
| **L2-TH03-02-01** Browse, search, inspect library | `library-index.test.ts`, `novel-search.test.ts`, `library-service.test.ts`, `library.page.test.ts`, `library-store.test.ts` | Partial to good for indexing/search and service results; Angular page/store coverage exists. | Full filter/sort combinations and inspector actions in rendered UI; prevent opening an importing novel; renderer file-service boundary against paths outside library. UI/Electron integration/E2E. |
| **L2-TH03-02-02** Edit metadata and cover | `novel-files.test.ts`, `library-service.test.ts`, `library-format.test.ts`, `novel.page.test.ts` | Partial: metadata validation/atomic save and service updates/locks are covered; UI page coverage is not a full edit journey. | Invalid cover presentation, replace/remove display after save, and unsaved discard/continue interaction. UI/E2E. |
| **L2-TH03-02-03** Delete and export novels | `library-service.test.ts`, `novel-files.test.ts`, `library-cleanup.test.ts`, `library-ipc.test.ts` | Partial: delete/lock and owned-file cleanup have tests. No `novel-export-pipeline.test.ts` or package writer test was found. | Export package contents/order, import-export round trip, cancellation/failure leaving no partial package, and confirmation/bulk-skip UI. Add export/package acceptance tests; UI flow E2E. |
| **L2-TH03-03-01** Read and navigate chapters | `novel-search.test.ts`; `novel.page.test.ts`; settings model tests | Partial: search service and some novel page behavior; no dedicated reader component test found. | First chapter/position, selected search match highlight, missing-file retry, keyboard suppression while typing, focus mode, cross-novel reading settings update/persistence. Reader E2E/UI tests. |
| **L2-TH03-03-02** Organize chapters | `shared/core/chapter-changes.test.ts`; `novel-files.test.ts`; `library-service.test.ts` | Strong for pure rename/reorder/merge/split/delete and file-backed save primitives. | Confirmation/cancellation dialogs, lock behavior in UI, and atomic rollback when an actual filesystem operation fails for merge/split/delete. E2E for interaction; inject filesystem failures in service/pipeline tests. |
| **L2-TH03-03-03** Edit chapter content | `novel-text.test.ts`; `novel-files.test.ts`; `library-service.test.ts`; `novel.page.test.ts` | Partial: text normalization, save primitives, and lock checks exist. No direct chapter editor component test found. | Editor save/cancel, empty validation feedback, unsaved navigation confirmation, updated search/derived counts and lock arriving during edit. UI/E2E. |
| **L2-TH04-01-01** Configure/run world analysis | `analysis-plan.test.ts`, `analysis-checks.test.ts`, `analysis-llm.test.ts`, `world-analysis-pipeline.test.ts`, `analysis-service.test.ts` | Strong service/pipeline acceptance coverage for preconditions, scope/overwrite, batching, stale chapters, retries, partial failures, progress and cancellation. | Configure/start/progress UX, actual LLM CLI communication and novel lock across app interactions. E2E with deterministic fake adapter; separate smoke test for real supported CLI. |
| **L2-TH04-01-02** Review/merge analysis | `analysis-review.test.ts`, `analysis-checks.test.ts`, `analysis-service.test.ts`, `world.test.ts` | Partial to good for issue construction/filtering, source/ontology checks, and service review data. | User edit/recheck/accept warning/resolve error/merge flow, merge disabled until errors resolved, and reanalysis replacing visible review. No dedicated review UI tests; needs UI/E2E and explicit merge behavior assertions. |
| **L2-TH04-01-03** Explore/edit world | `world.test.ts`, `analysis-service.test.ts`, `world-edit-dialog.component.test.ts` | Partial: world calculations, overlay persistence/orphans and edit dialog have tests. | Graph/table chapter-boundary selection, entity occurrence details, overlay surviving analysis + merge in one scenario, orphan surfaced in UI. UI/E2E. |
| **L2-TH04-05-01** Instructions and glossary | Original suite had no translation tests; current target adds `shared/core/glossary.test.ts`. | Partial: glossary row selection/batching is tested; instruction persistence, language/store behavior and UI empty state remain uncovered. | Shared instruction across workflows, glossary CRUD/filter, added/removed names and no-analysis state need service/UI acceptance coverage. |
| **L2-TH04-05-02** Translate glossary | Original suite had no translation tests; current target adds glossary batching rules and a pipeline precondition test. | Partial: entity batching and missing-novel block only. | Preserve user translations and partial completion on cancel need pipeline behavior coverage; CLI integration/E2E for wiring. |
| **L2-TH04-05-03** Translate/read chapters | Original suite had no translation tests; current target adds `translation-parts.test.ts`, `translation-check.test.ts`, `translation-status.test.ts`, reader selection, and a pipeline precondition test. | Partial: deterministic content splitting, glossary checks/status queue, chapter matching and missing-novel block are covered. | Stale/overwrite persistence, pipeline partial failure/lock and full original/translation/both UI flow remain uncovered. |

## Original test suite by level (before curation)

### 1. Component and function tests

The current suite has broad unit coverage in these areas:

- **Shared contracts and functions:** settings/LLM models, i18n, ontology/world rules, text matching, chapter text and chapter changes, analysis planning/checking/review.
- **Electron services and persistence:** app-data switching, storage paths/migrations/repositories, library package reader/files/index/search/service, diagnostics engine/checks, pipeline executor, LLM runner, analysis pipeline/service, logging.
- **Angular components/stores/pages:** shell route builder, library/import/home/settings/pipeline pages and stores, world edit dialog.
- **Python backend:** health/jobs/log behavior.

These tests establish local behavior and contracts. A page test with mocked APIs is still a component test unless it follows an L2 scenario through the real application boundary.

### 2. Acceptance scenario tests in the original suite

The closest existing tests to L2 acceptance checks are service/pipeline tests named with AC references, especially:

- `app-data-manager.test.ts` — initialize/open/switch app-data directories and rollback.
- `novel-import-pipeline.test.ts` and `package-reader.test.ts` — safe package preview/import, validation, cleanup and repeated imports.
- `world-analysis-pipeline.test.ts` and `analysis-service.test.ts` — world analysis scope, partial result retention, review and overlay behavior.
- `pipelines.page.test.ts`, `home.page.test.ts`, `library.page.test.ts`, `import.page.test.ts` — selected Angular page states and actions with test APIs.

They verified slices of acceptance criteria; they did not demonstrate a complete L1 capability end to end.

## Acceptance scenarios requiring E2E or real integration

No dedicated E2E test framework/files were found. Scenarios involving actual Electron startup/window navigation, IPC + renderer interaction, installed CLIs, OS packaging, notification opening, file pickers, or a complete user workflow should be covered by a small E2E suite. Priority gaps:

1. **Release foundation:** build/package on CI and launch the extracted app on a clean supported Windows environment.
2. **Shell and settings:** navigate real screens; change language/theme/storage settings; verify immediate effect and relaunch persistence.
3. **Pipelines:** start, observe, cancel, restart, open completion notification, inspect log and delete finished run.
4. **Library UI workflows:** import preview/edit/confirm; metadata/cover save and discard; chapter reader/editor/organize flows; export then re-import.
5. **Analysis UI workflow:** configure, run, review, fix/accept issues, merge, explore and edit world, rerun while retaining overlay.
6. **Translation:** core rules, partial glossary-batch cancellation, partial chapter completion, reader language matching, and store language/glossary editing now have focused tests. Instruction persistence, complete translation journeys, and UI-to-pipeline wiring still need broader integration/E2E coverage.

## Proposed coverage

This is the target suite inventory to write or rewrite, independent of which tests currently exist. Optimize for behavior boundaries and requirement risk: one focused test suite per cohesive module, compact decision tables for deterministic rules, and no shallow test for every method or presentational component. Playwright E2E owns complete user journeys; unit tests should prove local contracts that are faster and more diagnostic at the module boundary.

### Component and module unit tests

Keep each suite beside its implementation. Target this compact set of behavior owners:

#### Test naming and requirement traceability

- Keep the existing colocated filename pattern ending in `.test.ts` (or `test_*.py` for Python), so the test runner discovers suites next to their implementation.
- Prefix every TypeScript `describe` suite name with its primary L1 Capability ID in brackets, for example `describe('[TH03-03] chapter changes', ...)`. Use the ID exactly as written in requirements; when a suite covers multiple capabilities, give each capability a tagged suite rather than assigning one ambiguous ID.
- Prefix Python test function names with the same ID, replacing hyphens with underscores, for example `test_TH01_04_pipeline_job_status_and_cancellation`.
- For assertions that directly verify an L2 acceptance scenario, include the exact Spec ID in the test title, for example `it('[L2-TH03-03-01] suppresses reader shortcuts while typing', ...)`. Keep ordinary local function/module behavior tests under the tagged capability suite without inventing an L2 mapping.
- The separate acceptance-unit-test layer keeps its path convention `CapabilityID/SpecID.spec.ts`; the path itself carries the trace.

- **Shared models and rules:** `shared/models/settings.test.ts` and `llm.test.ts` for valid/default/invalid configuration decisions; `shared/core/novel-text.test.ts`, `chapter-changes.test.ts`, and `text-match.test.ts` for content normalization, chapter operation invariants, and the shared name matcher; `shared/core/analysis-plan.test.ts`, `analysis-checks.test.ts`, `analysis-review.test.ts`, and `world.test.ts` for scope/staleness, ontology/text validation, review gating, and generated/overlay world rules. Use table-driven cases to cover the decision branches in each module.
- **Electron infrastructure and orchestration:** `electron/main/storage/migrator.test.ts` for ordered/once-only migration and backup/rollback outcomes; `features/pipelines/pipeline-executor.test.ts` for legal transitions, cancellation/checkpoint cleanup and concurrency; `features/diagnostics/self-check-engine.test.ts` for independent checks and timeout/failure isolation; `features/llm/llm-runner.test.ts` plus one adapter contract suite for process result/timeout/structured-output handling.
- **Electron library contracts:** `features/library/package-reader.test.ts` and `package-writer.test.ts` for safe validation and package format round-trip; `features/library/novel/novel-files.test.ts` for atomic writes/cleanup and content lifecycle; `features/library/library-service.test.ts` for lock/validation boundaries. Avoid separate tests for trivial pass-through helpers unless they contain a distinct failure rule.
- **Electron analysis and translation:** `features/analysis/world-analysis-pipeline.test.ts` for preconditions, partial success/cancel and progress; `features/analysis/analysis-service.test.ts` for review/merge/overlay persistence boundaries; translation core tests for paragraph mapping, glossary checks/staleness, and one pipeline suite each for glossary and chapter partial completion/overwrite behavior.
- **Angular shared shell:** `angular/src/shell/rail/rail.component.test.ts` and `shell.routes.test.ts` for released/future module destinations; `shell/layout/layout.service.test.ts` for panel registration and edge visibility; `core/theme/theme.service.test.ts` for immediate document theme updates; `shell/topbar/topbar.component.test.ts` for language/theme actions reaching the settings boundary. These assert local shell contracts; navigation through real screens, preference persistence after relaunch, homepage activity, and notifications stay in Playwright E2E.
- **Angular feature components and state:** `angular/src/features/library/import/import.page.test.ts` for preview/validation view state; `novel-reader.component.test.ts` for translation/search selection and typing-target keyboard guards, plus `novel.page.test.ts` for focus-mode keyboard restore; `omniscient/components/review-view.component.test.ts` for review filters and chapter selection and `world-edit-dialog.component.test.ts` for entity selection/merge gating; `translation.store.test.ts` for language selection and glossary editing, with stale status covered by the shared translation rules. Use the Playwright suite for ordinary page rendering, navigation, dialogs, and form wiring rather than duplicating those checks in many component tests.
- **Python backend modules:** retain one compact `backend/tests/test_jobs.py` suite for job status/cancellation and one `backend/tests/test_log.py` suite for log rotation/format contract; omit separate health tests if the endpoint remains a constant readiness response covered by app startup/integration checks.

Do not create unit suites solely to assert static text, a simple input-to-output binding, or that every component renders. If a behavior is already asserted through a stronger module contract or the E2E journey and has no independent state/decision logic, omit its separate unit test.

### Acceptance-scenario unit tests by L1/L2

Keep this layer intentionally smaller than the L2 catalog. Place a suite under `electron/tests/<CapabilityID>/<SpecID>.spec.ts` only when it proves an important cross-module service contract that would be slow or ambiguous to diagnose through E2E. Per the requested path convention, Angular state/component contracts live under `angular/tests/<CapabilityID>/<SpecID>.spec.ts`; complete visible UI journeys still belong to Playwright. Use deterministic fakes at process, filesystem, clock, and IPC boundaries.

- `electron/tests/TH01-02/L2-TH01-02-01.spec.ts` — app-data startup contract: initialize new data; upgrade a populated store once with backup; keep startup blocked and prior data intact on failed/unknown migration.
- `electron/tests/TH01-04/L2-TH01-04-01.spec.ts` — pipeline lifecycle contract: queue/slot scheduling, cancel at checkpoint with cleanup, retain per-run logs/history, and recover active runs as cancelled on shutdown.
- `electron/tests/TH02-01/L2-TH02-01-01.spec.ts` — atomic app-data switch: successful empty/existing target; rollback on invalid target; reject switch while work is active; apply changed concurrency to queued work.
- `electron/tests/TH03-01/L2-TH03-01-01.spec.ts` — import orchestration: preview has no writes; edited preview imports as a new novel; invalid package reports safe issues; cancellation/write failure leaves no partial novel.
- `electron/tests/TH03-02/L2-TH03-02-03.spec.ts` — delete/export data contract: respect locks, export current ordered content, round-trip through package reader, and remove partial output after failure/cancel.
- `electron/tests/TH04-01/L2-TH04-01-01.spec.ts` — analysis orchestration: block invalid preconditions, apply chapter scope/overwrite, preserve completed chapter output on cancellation or isolated chapter failure.
- `electron/tests/TH04-01/L2-TH04-01-02.spec.ts` — review/merge transaction: edited issues are revalidated, open errors block merge, accepted warnings do not, and merge rebuilds from chapter results.
- `electron/tests/TH04-01/L2-TH04-01-03.spec.ts` — overlay contract: user edits survive a new analysis and merge; obsolete overlay entries are reported as orphans.
- `electron/tests/TH04-05/L2-TH04-05-02.spec.ts` — glossary translation pipeline: eligible selection, aliases kept together, user entries preserved, and completed translations retained after cancellation.
- `electron/tests/TH04-05/L2-TH04-05-03.spec.ts` — chapter translation contract: paragraph/glossary validation, stale rules, explicit overwrite of user edits, and partial chapter completion on failure/cancel.

Other L2 behaviors are covered by focused module tests and Playwright acceptance journeys; avoid a separate acceptance-unit file for every L2 purely to mirror the requirements sheet. Build/package on clean Windows, actual CLI compatibility, native OS behavior, and app-wide IPC/window workflows are integration/E2E checks rather than unit tests.

### Proposed Playwright `verify` E2E project

Keep E2E in a separate root `verify/` project. Its tests launch the built Electron app and verify user-visible scenarios across Angular, preload/IPC, Electron services, storage and pipeline handling. Keep the unit acceptance suites above in `angular/tests` and `electron/tests`; E2E files can use the same requirement IDs while owning the complete user journey.

```text
verify/
  playwright.config.ts
  fixtures/
    app.fixture.ts              # launch/close Electron; expose window and app controls
    app-data.fixture.ts         # isolated app-data/settings roots per test
    llm.fixture.ts              # deterministic fake CLI/provider responses
    dialogs.fixture.ts          # stub open/save/message dialogs in Electron main process
    library.fixture.ts          # seed novels/packages and clean temporary files
  helpers/
    navigation.ts
    pipeline.ts
    requirements.ts             # shared test ids / trace annotations
  e2e/
    TH01-01/L2-TH01-01-01.spec.ts
    TH01-02/L2-TH01-02-01.spec.ts
    TH01-03/L2-TH01-03-01.spec.ts
    TH01-04/L2-TH01-04-01.spec.ts
    TH02-01/L2-TH02-01-01.spec.ts
    TH02-02/L2-TH02-02-01.spec.ts
    TH02-03/L2-TH02-03-01.spec.ts
    TH03-01/L2-TH03-01-01.spec.ts
    TH03-02/L2-TH03-02-01.spec.ts
    TH03-02/L2-TH03-02-02.spec.ts
    TH03-02/L2-TH03-02-03.spec.ts
    TH03-03/L2-TH03-03-01.spec.ts
    TH03-03/L2-TH03-03-02.spec.ts
    TH03-03/L2-TH03-03-03.spec.ts
    TH04-01/L2-TH04-01-01.spec.ts
    TH04-01/L2-TH04-01-02.spec.ts
    TH04-01/L2-TH04-01-03.spec.ts
    TH04-05/L2-TH04-05-01.spec.ts
    TH04-05/L2-TH04-05-02.spec.ts
    TH04-05/L2-TH04-05-03.spec.ts
    release/portable-launch.spec.ts
  artifacts/                    # generated traces/screenshots/reports; gitignored
```

Configuration and execution proposal:

- Use `@playwright/test` and one Playwright project named `verify`, with `testDir: './e2e'`, a longer per-test timeout for app startup/pipelines, and trace/screenshot capture on failure. Run tests serially initially because they launch the desktop app and modify local data; allow parallel workers only after each app-data root and backend port are isolated.
- Resolve the Electron executable and built main entry point from the repository's build outputs. Provide a `pnpm verify` script that builds the app first and then runs `playwright test --config=verify/playwright.config.ts`; keep `verify/release/portable-launch.spec.ts` as a separate CI job that launches the packaged artifact on supported Windows.
- Have `app.fixture.ts` create a fresh temporary user-data and app-data root for every test, pass them through test-only environment/configuration, capture main-process and renderer console errors, and close the app in teardown. Never share the developer's real app-data directory.
- Use `llm.fixture.ts` to return deterministic structured responses and controlled errors/delays. The acceptance E2E should not depend on network access or locally installed Claude/Codex/Antigravity CLIs; keep a separate opt-in smoke check for real CLI integration.
- Stub Electron native dialogs through `electronApp.evaluate()` before each flow. Playwright's Electron automation support is documented as experimental; it does not intercept native dialog calls automatically, so the fixture should replace those APIs with deterministic responses. See [Playwright Electron API](https://playwright.dev/docs/api/class-electron).
- Use `data-testid` only for stable controls that do not have an accessible role/name; otherwise locate controls by role and label. Annotate tests with L1/L2 IDs and attach trace/report links so failures map back to a requirement.
- Include acceptance flows for the 18 L2 specifications listed above. `portable-launch.spec.ts` covers package extraction/launch separately; any behavior requiring a clean Windows image, actual CLI executable, OS permission, or real notification center remains a platform integration/manual release check.

Suggested first E2E slice: `TH03-01` package import (with a stubbed file dialog), `TH01-04` pipeline lifecycle, and `TH04-01` analyze/review/merge with the fake LLM. These exercise the core app boundaries and establish fixtures before expanding to all listed specs.

## Summary

- The curated suite targets foundation rules, settings, library, analysis, and core translation functions.
- L2 acceptance evidence is strongest for app-data switching, package import and world analysis pipelines.
- UI-level acceptance is generally partial; page tests render production pages with mocked APIs, rather than exercising the complete Electron app.
- Novel export orchestration and translation pipeline/store journeys are the largest remaining gaps in the curated suite.
- This is a static mapping of test intent and assertions, not a statement that the tests currently pass.
