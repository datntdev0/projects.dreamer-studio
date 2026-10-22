# DESIGN.md

Visual foundations of Dreamer Studio (Novel Studio): colors, typography, iconography, spacing, components and layout.

Live reference: Storybook (`pnpm storybook`, stories in `angular/stories`), with a light/dark theme toolbar (REQ-001).

Source of truth: `angular/src/styles/_tokens.scss`, `_base.scss`, `_fonts.scss`, `_bootstrap.scss`, `_layout.scss`, `components/_<name>.scss`, and `angular/src/assets/icons.svg`. Always use the CSS tokens below, never raw values.

## 1. Colors

The theme is set by `data-theme="dark" | "light"` on `<html>` (Storybook: theme toolbar; app: `ThemeService`, top bar button, REQ-003). Every start is light until settings are saved (TSK-010). Settings offers Dark and Light only.

### Brand (same in both themes)

| Token | Value | Use |
| --- | --- | --- |
| `--color-primary` | `#3ecf8e` | Primary buttons, active indicators, badges, running dot |
| `--color-primary-hover` | `#35c383` | Primary hover |
| `--color-primary-active` | `#2daf74` | Primary pressed |
| `--color-on-primary` | `#092117` | Text and icons on primary |

### Semantic

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--color-background` | `#101211` | `#ffffff` | App background |
| `--color-surface` | `#171a18` | `#f7f8f7` | Panels, disabled fields |
| `--color-surface-raised` | `#1d211f` | `#ffffff` | Buttons, inputs, cards, dialogs |
| `--color-surface-muted` | `#252a27` | `#eef1ef` | Hover, neutral pills, inline code |
| `--color-text` | `#f0f3f1` | `#171917` | Body text |
| `--color-text-secondary` | `#b5bcb8` | `#59615c` | Labels, ghost buttons, `.muted` |
| `--color-text-tertiary` | `#8e9792` | `#6b736e` | Placeholders, metadata (`.meta`), disabled |
| `--color-border` | `#303632` | `#dce1de` | Default borders |
| `--color-border-strong` | `#4a534e` | `#b9c1bc` | Hover borders, scrollbar thumb, `kbd` |
| `--color-link` | `#6addaa` | `#176b4b` | Links, info and running pills |
| `--color-focus` | `#72e7b4` | `#157a52` | Focus ring |
| `--color-success` | `#65d6a0` | `#18794e` | Success state |
| `--color-warning` | `#f2bd5b` | `#8a5a00` | Warning, paused, `mark` highlight |
| `--color-danger` | `#ff8a91` | `#b4232c` | Errors, destructive actions |
| `--color-code-background` | `#0a0c0b` | `#1b1e1c` | Code blocks (dark in both themes) |
| `--color-code-text` | `#e8eeea` | `#edf2ef` | Code block text |

### Elevation and overlay

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--shadow-1` | `0 1px 3px rgba(0,0,0,.35)` | `0 1px 3px rgba(15,23,18,.08)` | Small raised items (selected segment) |
| `--shadow-2` | `0 12px 28px rgba(0,0,0,.45)` | `0 8px 24px rgba(15,23,18,.12)` | Popovers (novel context chip menu) |
| `--shadow-3` | `0 20px 56px rgba(0,0,0,.55)` | `0 18px 48px rgba(15,23,18,.18)` | Dialogs, command palette, assistant popup |
| `--scrim` | `rgba(0,0,0,.62)` | `rgba(0,0,0,.4)` | Backdrop behind dialogs |

### Rules

- Tinted backgrounds mix the status color with transparent: `color-mix(in srgb, var(--color-success) 14%, transparent)` (warning uses 16%).
- Text selection: primary at 28%. `mark`: warning at 35%.
- WCAG AA contrast in both themes: 4.5:1 for text, 3:1 for large text and control borders.
- Never use color alone for a state: always add a label, icon or shape.
- Bootstrap variables (`--bs-*`) are mapped to these tokens in `_bootstrap.scss`; do not set Bootstrap colors directly.

## 2. Typography

### Font families

| Token | Stack | Use |
| --- | --- | --- |
| `--font-sans` | Inter, Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif | UI: navigation, headings, controls, metadata |
| `--font-serif` | Source Serif 4, Cambria, Noto Serif CJK SC, Source Han Serif SC, Times New Roman, serif | Reading column, side-by-side text (class `.serif`) |
| `--font-mono` | ui-monospace, Consolas, Menlo, Monaco, Liberation Mono, monospace | `code`, `kbd`, `.ds-input.mono` |

- Inter and Source Serif 4 are variable fonts from npm `@fontsource-variable/inter` and `@fontsource-variable/source-serif-4` (SIL OFL), declared in `_fonts.scss` (latin, latin-ext, vietnamese) and bundled by the Angular build.
- Cambria is the serif fallback because it has full Vietnamese tone marks. Do not use Georgia (missing glyphs such as ẳ, ễ, ở, ự).
- Noto Serif CJK SC / Source Han Serif SC cover Chinese source text.

### Type scale

Base: `13px / 1.45`, weight 400 (`body`).

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| `h1` page title | 22px | 600 | 1.25 |
| `h2` section title | 18px | 600 | 1.4 |
| Dialog title | 16px | 600 | — |
| `h3` card / group title | 14px | 600 | 1.45 |
| Body, large button | 13px | 400 / 600 | 1.45 |
| `h4` sub-label | 12px | 500, secondary color | 1.4 |
| Field label, input, button, table cell, `.meta` | 12px | 500 / 600 / 400 | — |
| Small button, pill, status bar, `kbd` | 11px | 500 / 600 | — |
| Badge | 10px | 700 | 1 |

- Headings use `letter-spacing: -0.1px`.
- Weights in use: 400 regular, 500 medium, 600 semibold, 700 bold (badges and brand only).
- Counts, timers, word counts and progress use tabular numerals (class `.num`).
- Large display sizes (36–64px) are not used inside the app.

### Reader

| Token | Value |
| --- | --- |
| `--reader-size` | 18px |
| `--reader-measure` | 72ch |
| `--reader-leading` | 1.75 |

The reader changes these values from the Reading tab (font size, line width, line spacing).

## 3. Iconography

### System icons

- One inline SVG sprite: `angular/src/assets/icons.svg`, injected once into `<body>` by `provideIconSprite()`.
- Each icon is a `<symbol id="i-<name>" viewBox="0 0 24 24">`, outline style.
- Stroke: `currentColor`, width `1.75` (`1.5` at xl), round caps and joins, no fill. Icons take the text color of their parent.
- Use the component: `<ds-icon name="search" size="sm" />`. It is decorative (`aria-hidden="true"`); the button or link must carry the label or tooltip.

| Size | Class | Pixels | Use |
| --- | --- | --- | --- |
| `sm` | `.icon.sm` | 14px | Small buttons, dense rows, pills |
| `md` (default) | `.icon` | 16px | Buttons, rail, toolbars, lists |
| `lg` | `.icon.lg` | 20px | Larger controls, headers |
| `xl` | `.icon.xl` | 28px | Empty states |

Size tokens: `--icon-sm|md|lg|xl`, rail icon `--icon-rail` (18px), stroke `--icon-stroke` / `--icon-stroke-xl`.

### Available icons

```
search plus minus x check more
chevron-down chevron-up chevron-left chevron-right chevrons-left chevrons-right
arrow-up arrow-down arrow-left arrow-right external link
library book globe network tasks settings home inbox bell
panel-left panel-right panel-bottom columns grid list layers maximize
play pause stop retry skip repeat record disc
sun moon monitor command keyboard terminal cpu zap
alert-triangle alert-circle info shield lock key flag star
pencil save undo redo type copy scissors replace replace-all trash
file file-zip folder download upload filter sliders palette
user building pin tag clock hash diamond merge sparkles message send
headphones mic pronounce music volume waveform film video image image-off camera
puzzle box cube storyboard nodes anchor move rotate scale pointer hand map
languages eye
```

### Adding an icon

- Add a `<symbol>` to `icons.svg` with a 24×24 viewBox and stroke-only paths, matching the existing outline style.
- Name it `i-<kebab-name>`; reuse an existing icon before adding a new one.

### Brand

- Files: `angular/public/logo.svg` (app icon; not `icon.svg`, so it is not confused with the sprite), `angular/public/brand/dreamer-studio-mark-dark.svg` and `-light.svg`.
- App icon (dark rounded tile) is used where the OS shows the app. Minimum size 16px.
- In the top bar the mark is shown at 22px, switching between dark and light variants by theme.
- Keep about 1/4 of the mark height clear on every side.

## 4. Spacing

### Spacing scale

| Token | Value | Bootstrap spacer |
| --- | --- | --- |
| `--sp-xxs` | 2px | — |
| `--sp-xs` | 4px | `1` |
| `--sp-sm` | 8px | `2` |
| `--sp-md` | 12px | `3` |
| `--sp-lg` | 16px | `4` |
| `--sp-xl` | 24px | `5` |
| `--sp-xxl` | 32px | `6` |
| `--sp-huge` | 64px | — |

Common uses: field label gap `--sp-xs`, button padding `--sp-md` (sm: `--sp-sm`, lg: `--sp-lg`), input padding `--sp-sm`, paragraph bottom margin `--sp-sm`.

### Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius-xs` | 4px | `code`, `kbd`, small chips |
| `--radius-sm` | 6px | Buttons, inputs (Bootstrap default) |
| `--radius-md` | 8px | Cards, task rows, dropzone, banners |
| `--radius-lg` | 12px | Dialogs, command palette, toasts |
| `--radius-xl` | 16px | Not used yet |
| `--radius-full` | 9999px | Pills, badges, dots, scrollbar thumb |

### Control heights

| Control | Token | Size |
| --- | --- | --- |
| Button / input / select (default) | `--control-h` | 28px |
| Small button | `--control-h-sm` | 24px |
| Large button | `--control-h-lg` | 36px |
| Pill | `--pill-h` | 20px |
| Badge | `--badge-h` | 16px |
| Status dot | `--dot-size` | 7px |
| Progress bar | `--progress-h` × `--progress-w` | 4px × 140px |

### Shell layout

| Token | Value | Zone |
| --- | --- | --- |
| `--top-h` | 40px | Top bar |
| `--status-h` | 24px | Status bar |
| `--rail-w` | 48px | Module rail, collapsed |
| `--rail-w-expanded` | 200px | Module rail, expanded |
| `--left-w` | 272px | Left panel (default) |
| `--right-w` | 304px | Right panel (default) |
| `--bottom-h` | 208px | Bottom panel (default) |
| `--gutter` | 1px | Splitter (`ds-splitter`) line between a panel and the center; hit area 9px |
| `--panel-min-w` / `--panel-min-h` | 160px / 120px | Panel minimum width (left, right) / height (bottom) |
| `--rail-row-h` | 30px | Rail entry, expanded |
| `--rail-entry` | 32px | Rail entry, collapsed (square) |
| `--page-max-w` | 1040px | Page body `.narrow` (Home) |
| `--home-card-min-w` | 280px | Home status card minimum width (`auto-fit` grid) |
| `--home-tile-size` | 44px | Home recent pipeline tile |
| `--home-when-w` | 96px | Home recent pipeline relative time column |
| `--dialog-w` | 420px | Dialog width |
| `--toast-w` | 340px | Toast width |
| `--tooltip-max-w` | 280px | Tooltip max width |
| `--area-text-w` / `--area-details-w` | 360px / 480px | Area state text / Details max width |

- Panels are resizable with `ds-splitter`: minimum is `--panel-min-w` / `--panel-min-h`, maximum is 50% of the workspace width (left, right) or 60% of the center height (bottom). Default sizes are the tokens above; Enter or double-click resets.
- Minimum window: 1280×720.
- When the workspace is narrower than 760px, toolbar segmented buttons and toggles show icons only (label in tooltip).

## 5. Focus and motion

- Focus: `var(--focus-width) solid var(--color-focus)` (2px) with `--focus-offset` (2px) on every interactive element (inputs use `--focus-offset-inset`, -1px).
- Transitions are short (`--motion-fast`, 120ms, on color and border).
- `prefers-reduced-motion: reduce` turns off all animations and transitions.
- Scrollbar: thin (`--scrollbar-size` 10px, `--scrollbar-gap` 3px), thumb `--color-border-strong`, radius full.

## 6. Components and layout

Angular components in `angular/src/components/<name>/` (prefix `ds-`), styles in `angular/src/styles/components/_<name>.scss`, one story file per component in `angular/stories/components/`, one story per state (same structure as `card.stories.ts`). Text a component shows by itself (close, cancel, details) is an input; callers pass translated text.

| Component | Use | Class / API |
| --- | --- | --- |
| Button | `<button dsBtn variant size iconOnly loading>` | `.ds-btn` + `primary`, `ghost`, `danger`, `danger-solid`, `sm`, `lg`, `icon-only` |
| Input / select | native elements in `<ds-field label hint error required span>` | `.ds-input` (`.mono`), `span.ds-select > select.ds-input + ds-icon` |
| Segmented, checkbox | `<ds-segmented [options] [(value)]>`, `<ds-checkbox [(checked)]>` | radio-group with arrow keys |
| Form grid | 2 columns when the grid is 760px or wider, 1 below; long fields `span="full"` | `.ds-form-grid > .ds-form-grid-fields` (container query) |
| Card | `<ds-card icon heading interactive>`, right slot `[dsCardEnd]` | `.ds-card`, `.interactive` = button role, hover border, focus ring |
| Status | `<ds-pill kind dot>`, `<ds-badge>`, `<ds-dot kind pulse>`, `<ds-progress [value]>` (null = indeterminate) | `.ds-pill`, `.ds-badge`, `.ds-dot`, `.ds-progress` |
| Dialog | `<ds-dialog [open] heading closeLabel (closed)>`; `ConfirmService.confirm()` + `<ds-confirm-host />` once | native `<dialog>`: scrim, focus trap, Esc |
| Toast | `ToastService.show({ kind, title, message, action })` + `<ds-toast-outlet closeLabel>` once | bottom-right, max 3, success hides after 5 s, danger stays |
| Table | native `<table>` | `.ds-table-wrap > .ds-table`, `.num`, `td.ds-table-empty`, `.skeleton` rows |
| Tooltip | `[dsTooltip]="text"`, `dsTooltipWhenTruncated` | inverted, 11px, `--shadow-2`, on hover and focus |
| Splitter | `<ds-splitter [target] edge label min max (resized)>`, edge = left, right, bottom | `role="separator"`, drag, arrows (16px), Home / End, Enter or double-click resets; 1px line (`--gutter`), 3px primary on hover, focus and drag |
| Area state | `<ds-area-state kind icon heading description details detailsLabel compact>`, kind = empty, loading, error | loading `role="status"`, error `role="alert"` with Details |

Layout (`_layout.scss`, stories in `angular/stories/layout/`):

- App grid `.ds-app` (`.rail-collapsed`): `.ds-app-top` · `.ds-app-rail` | `.ds-app-main` · `.ds-app-status`; the shell renders optional `.ds-panel-left` · `.ds-app-center` (page + optional `.ds-panel-bottom`) · `.ds-panel-right` through `ds-panel-outlet` (left, bottom inside `.ds-app-center`, right), split by `ds-splitter` (`--gutter`); `.ds-toast-area` inside it is positioned in the shell. A page declares panel content with `<ng-template dsPanel="left|right|bottom" label resizeLabel testId panelClass>`; `LayoutService` keeps the open state.
- Top bar: `.ds-app-brand` button (`.ds-brand-mark` 22px, `--brand-mark-size`, + `.version`), `.ds-app-crumbs` (`.sep`, `.page`), `.ds-spacer`, `.ds-app-tools` (panel toggles `.panel-toggle` with `panel-left` / `panel-right` / `panel-bottom` icons and `aria-pressed`, disabled when the page has no such panel, before language `.lang` at `--lang-btn-w`; then theme and Settings; ghost buttons). `.ds-only-light` / `.ds-only-dark` show an element in one theme only (brand mark, sun / moon).
- Rail: `.ds-rail-group` (`.ds-rail-title`, `.ds-rail-sep`, `.ds-rail-entry` with `.label`); expanded shows titles and 30px rows, collapsed shows 32px entries split by `.ds-rail-sep` with a tooltip. Active entry: `aria-current="page"`, muted background + 2px primary bar. System group (Pipelines, Settings) pinned to the bottom in `.ds-rail-bottom` (D-03).
- Status bar: `.ds-app-status` with `.item` (`.path` truncates first; `button.item` has a hover background), `.ds-spacer`.
- Page frame `.ds-page`: `.ds-page-toolbar` (`--top-h`, `h1` styled as h3, `.ds-page-actions` right) + `.ds-page-body` (scrolls, padding `--sp-lg`; `.narrow`, `.center`) + optional `.ds-page-footer`.
- Workbench `.ds-workbench`: optional `.ds-panel-left` + `ds-splitter`, `.ds-workbench-center` (main + `ds-splitter` + `.ds-panel-bottom`) + `ds-splitter` + `.ds-panel-right`; each panel starts with a fixed `.ds-panel-head` (`--top-h` row, same height as `.ds-page-toolbar`: `h2`, meta, `.ds-spacer`, actions); only `.ds-panel-body` scrolls. Used by Import.
- Patterns: workbench (toolbar actions + panels), list (toolbar + table), detail (`.ds-split`, `.ds-meta-list`), form (form grid + footer actions), empty state (centered area state).
- App shell (REQ-003, story `Shell/App shell`): `ShellComponent` = `header[dsTopbar]`, `nav[dsRail]`, `.ds-app-main` (`ds-panel-outlet` for left, `.ds-app-center` with error banners + router outlet + bottom outlet, then right outlet), `footer[dsStatusBar]`, `ds-toast-outlet`. Pages declare panels with `<ng-template dsPanel="left|right|bottom" label resizeLabel testId panelClass>`; `LayoutService` keeps open state. Rail entries are links (`routerLinkActive` → `aria-current="page"`).
- Page: the page component host is the `.ds-page` (`host: { class: 'ds-page' }`), so `.ds-app-center > .ds-page` fills the center with `--color-background`.
- Page title: `h1 dsPageTitle` gets `tabindex="-1"` and focus after navigation, without a focus ring.
- Coming soon (`shell/coming-soon`): page toolbar + centered `.ds-area-state.coming-soon` (module icon, name, `clock` pill, description, release line, Back to Home).
- Home (`features/home`, story `Pages/Home`): toolbar shortcuts, `.home-cards` (App data, AI backend, Running now), recent pipelines list `.home-recent-row` (tile tinted by `data-status`); each area has its own loading, error and empty state.
