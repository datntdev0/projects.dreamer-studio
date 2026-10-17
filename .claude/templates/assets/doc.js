/* Shared behavior for _docs/*.html: theme, TOC, tabs, filter, mermaid, decisions. */
(function () {
  const STORE = "doc:" + location.pathname;
  const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";
  const themeListeners = [];

  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function storage(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch { return null; }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function slug(text) {
    return text.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  }

  // ---------- theme ----------

  function currentTheme() {
    return document.documentElement.dataset.theme;
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    storage("doc:theme", theme);
    themeListeners.forEach((listener) => listener(theme));
  }

  // Runs in <head> so the page paints in the right theme.
  function applySavedTheme() {
    const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = storage("doc:theme") || preferred;
  }

  function initThemeToggle() {
    $$('[data-action="toggle-theme"]').forEach((button) =>
      button.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark")));
  }

  // ---------- table of contents ----------

  function buildToc() {
    const toc = document.querySelector(".doc-toc");
    if (!toc) return;
    toc.innerHTML = $$(".doc-main h2, .doc-main h3").map((heading) => {
      heading.id ||= slug(heading.textContent);
      const level = heading.tagName === "H3" ? "level-3" : "";
      return `<a class="${level}" href="#${heading.id}">${escapeHtml(heading.textContent)}</a>`;
    }).join("");
  }

  // ---------- tabs: <div class="tabs"><button data-tab="a">  +  <div data-tab-panel="a"> ----------

  function initTabs(root = document) {
    $$(".tabs", root).forEach((tabs) => {
      const buttons = $$("button[data-tab]", tabs);
      const select = (name) => {
        buttons.forEach((button) => {
          const active = button.dataset.tab === name;
          button.setAttribute("aria-selected", active);
          const panel = document.querySelector(`[data-tab-panel="${button.dataset.tab}"]`);
          if (panel) panel.hidden = !active;
        });
        refreshDiagrams();
      };
      buttons.forEach((button) => button.addEventListener("click", () => select(button.dataset.tab)));
      if (buttons.length) select(buttons[0].dataset.tab);
    });
  }

  // ---------- filter: <input data-filter=".selector"> hides items whose text does not match ----------

  function initFilters() {
    $$("input[data-filter]").forEach((input) => input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      $$(input.dataset.filter).forEach((item) => {
        item.hidden = query && !item.textContent.toLowerCase().includes(query);
      });
    }));
  }

  // ---------- mermaid: <pre class="mermaid"> diagrams, re-rendered on theme change ----------

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement("script"), { src: url, onload: resolve, onerror: reject });
      document.head.append(script);
    });
  }

  // Renders only visible diagrams not yet drawn in the current theme; hidden tabs render when shown.
  async function renderMermaid() {
    const theme = currentTheme();
    const diagrams = $$(".mermaid").filter((d) => d.offsetParent !== null && d.dataset.renderedTheme !== theme);
    if (!diagrams.length) return;
    diagrams.forEach((diagram) => {
      diagram.dataset.source ??= diagram.textContent;
      diagram.dataset.renderedTheme = theme;
    });
    if (!window.mermaid) await loadScript(MERMAID_URL);
    diagrams.forEach((diagram) => {
      diagram.removeAttribute("data-processed");
      diagram.textContent = diagram.dataset.source;
    });
    window.mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default" });
    await window.mermaid.run({ nodes: diagrams });
  }

  function refreshDiagrams() {
    renderMermaid().catch((error) => console.warn("mermaid:", error));
  }

  // ---------- decisions: <section class="decision" data-id="AD-01"> with radio options and a note ----------

  function readDecision(section) {
    const checked = section.querySelector("input[type=radio]:checked");
    return {
      id: section.dataset.id,
      title: section.querySelector("h3")?.textContent.trim() ?? section.dataset.id,
      choice: checked?.value ?? "",
      note: section.querySelector("[data-note]")?.value.trim() ?? "",
    };
  }

  function updateStatus(section) {
    const pill = section.querySelector("[data-status]");
    if (!pill) return;
    const decided = Boolean(readDecision(section).choice);
    pill.textContent = decided ? "Decided" : "Open";
    pill.className = "pill " + (decided ? "success" : "warning");
  }

  function decisionsMarkdown() {
    const lines = [`# Decisions: ${document.title}`, "", `Exported ${new Date().toISOString().slice(0, 10)}`, ""];
    $$(".decision").forEach((section) => {
      const decision = readDecision(section);
      lines.push(`- **${decision.title}**: ${decision.choice || "(open)"}`);
      if (decision.note) lines.push(`  - note: ${decision.note.replace(/\n/g, " ")}`);
    });
    return lines.join("\n") + "\n";
  }

  function exportDecisions() {
    const markdown = decisionsMarkdown();
    navigator.clipboard?.writeText(markdown).catch(() => {});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    link.download = location.pathname.split("/").pop().replace(/\.html$/, "") + ".decisions.md";
    link.click();
  }

  function initDecisions() {
    const sections = $$(".decision");
    if (!sections.length) return;
    const saved = storage(STORE) || {};
    sections.forEach((section) => {
      const state = saved[section.dataset.id] || { choice: section.dataset.decided, note: "" };
      const radio = $$("input[type=radio]", section).find((input) => input.value === state.choice);
      if (radio) radio.checked = true;
      const note = section.querySelector("[data-note]");
      if (note && state.note) note.value = state.note;
      section.addEventListener("input", () => {
        const all = storage(STORE) || {};
        all[section.dataset.id] = readDecision(section);
        storage(STORE, all);
        updateStatus(section);
      });
      updateStatus(section);
    });
    $$('[data-action="export-decisions"]').forEach((button) => button.addEventListener("click", exportDecisions));
    $$('[data-action="reset-decisions"]').forEach((button) => button.addEventListener("click", () => {
      storage(STORE, {});
      location.reload();
    }));
  }

  // ---------- boot ----------

  applySavedTheme();
  document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    buildToc();
    initTabs();
    initFilters();
    initDecisions();
    refreshDiagrams();
    themeListeners.push(refreshDiagrams);
    $$("details").forEach((details) => details.addEventListener("toggle", refreshDiagrams));
  });

  window.Doc = { $$, escapeHtml, storage, initTabs, buildToc, onThemeChange: (fn) => themeListeners.push(fn) };
})();
