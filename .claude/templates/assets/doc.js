/* Shared behavior for _docs/*.html: theme, TOC, tabs, filter, mermaid, flows, decisions. */
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

  // ---------- flow: interactive sequence diagram ----------
  // <div class="flow"><ol class="flow-lanes"><li>Main</li>…</ol>
  //   <ol class="flow-steps"><li data-from="Main" data-to="Backend" [data-kind="return"]><b>label</b> detail</li>…</ol></div>

  const SVG_NS = "http://www.w3.org/2000/svg";
  const FLOW = { laneWidth: 180, headHeight: 40, rowHeight: 36, top: 8, selfWidth: 32, playMs: 1400 };

  function svgElement(tag, attributes, text) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function flowControls() {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `<button class="btn" data-flow="prev">◀ Prev</button><button class="btn" data-flow="next">Next ▶</button>
      <button class="btn" data-flow="play">Play</button><button class="btn" data-flow="all">Show all</button><span class="meta" data-flow-position></span>`;
    return toolbar;
  }

  function drawFlowSvg(lanes, steps, markerId) {
    const { laneWidth, headHeight, rowHeight, top, selfWidth } = FLOW;
    const width = laneWidth * lanes.length;
    const height = top + headHeight + rowHeight * (steps.length + 0.5);
    const laneX = (name) => (lanes.indexOf(name) + 0.5) * laneWidth;
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Sequence flow" });
    svg.style.maxWidth = `${width}px`;
    const markers = ["", "-active"].map((suffix) => {
      const size = suffix ? 4 : 6;
      return `<marker id="${markerId}${suffix}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path class="arrow${suffix ? " active" : ""}" d="M0,0 L10,5 L0,10 z"/></marker>`;
    });
    svg.innerHTML = `<defs>${markers.join("")}</defs>`;

    lanes.forEach((name) => {
      const x = laneX(name);
      svg.append(svgElement("line", { class: "lifeline", x1: x, y1: top + headHeight, x2: x, y2: height }));
      const node = svgElement("g", { class: "node" });
      node.append(svgElement("rect", { x: x - laneWidth / 2 + 12, y: top, width: laneWidth - 24, height: headHeight - 8, rx: 8 }));
      node.append(svgElement("text", { class: "title", x, y: top + (headHeight - 8) / 2 }, name));
      svg.append(node);
    });

    const edges = steps.map((step, index) => {
      const y = top + headHeight + rowHeight * (index + 0.8);
      const from = laneX(step.dataset.from);
      const to = laneX(step.dataset.to ?? step.dataset.from);
      const self = from === to;
      const lastLane = from === laneX(lanes.at(-1));
      const label = `${index + 1}. ${step.querySelector("b")?.textContent ?? ""}`;
      const edge = svgElement("g", { class: `flow-edge ${step.dataset.kind ?? ""}` });
      const left = self ? from - (lastLane ? selfWidth : 0) : Math.min(from, to);
      edge.append(svgElement("rect", { class: "hit", x: left - 8, y: y - rowHeight / 2 - 4, width: Math.abs(to - from) + selfWidth + 16, height: rowHeight }));
      const direction = lastLane ? -1 : 1;
      const path = self ? `M${from},${y - 6} h${direction * selfWidth} v12 h${-direction * selfWidth}` : `M${from},${y} L${to},${y}`;
      edge.append(svgElement("path", { class: "edge", d: path, "marker-end": `url(#${markerId})` }));
      const labelX = self ? from + direction * (selfWidth + 6) : (from + to) / 2;
      const anchor = self ? (lastLane ? "end" : "start") : "middle";
      edge.append(svgElement("text", { class: "label", x: labelX, y: self ? y : y - 10, "text-anchor": anchor }, label));
      svg.append(edge);
      return edge;
    });
    return { svg, edges };
  }

  function initFlow(flow, flowIndex) {
    const lanes = $$(".flow-lanes > li", flow).map((lane) => lane.textContent.trim());
    const steps = $$(".flow-steps > li", flow);
    const markerId = `flow-arrow-${flowIndex}`;
    const { svg, edges } = drawFlowSvg(lanes, steps, markerId);
    const diagram = document.createElement("div");
    diagram.className = "diagram";
    diagram.append(svg);
    const toolbar = flowControls();
    flow.querySelector(".flow-steps").before(toolbar, diagram);
    flow.tabIndex = 0;

    let active = -1;
    let timer = null;
    const position = toolbar.querySelector("[data-flow-position]");
    const playButton = toolbar.querySelector('[data-flow="play"]');

    function select(index) {
      active = index;
      [edges, steps].forEach((items) => items.forEach((item, i) => {
        item.classList.toggle("active", i === index);
        item.classList.toggle("pending", index >= 0 && i > index);
      }));
      edges.forEach((edge, i) => edge.querySelector(".edge").setAttribute("marker-end", `url(#${markerId}${i === index ? "-active" : ""})`));
      position.textContent = index < 0 ? `All ${steps.length} steps` : `Step ${index + 1} of ${steps.length}`;
    }
    function stop() {
      clearInterval(timer);
      timer = null;
      playButton.textContent = "Play";
    }
    function move(delta) {
      select(Math.min(steps.length - 1, Math.max(0, active + delta)));
    }
    function play() {
      if (timer) return stop();
      playButton.textContent = "Pause";
      if (active >= steps.length - 1 || active < 0) select(0);
      timer = setInterval(() => (active >= steps.length - 1 ? stop() : move(1)), FLOW.playMs);
    }

    const actions = { prev: () => move(-1), next: () => move(1), play, all: () => select(-1) };
    toolbar.addEventListener("click", (event) => {
      const action = event.target.closest("[data-flow]")?.dataset.flow;
      if (!action) return;
      if (action !== "play") stop();
      actions[action]();
    });
    [edges, steps].forEach((items) => items.forEach((item, i) => item.addEventListener("click", () => { stop(); select(i); })));
    flow.addEventListener("keydown", (event) => {
      const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      stop();
      move(delta);
    });
    select(-1);
  }

  function initFlows(root = document) {
    $$(".flow", root).forEach(initFlow);
  }

  // ---------- decisions: <section class="decision" data-id="ADR-01"> with radio options and a note ----------

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

  // Call again after rendering decisions dynamically (e.g. from the xlsx).
  function initDecisions(root = document) {
    const saved = storage(STORE) || {};
    $$(".decision", root).forEach((section) => {
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
  }

  function initDecisionButtons() {
    $$('[data-action="export-decisions"]').forEach((button) => button.addEventListener("click", exportDecisions));
    $$('[data-action="reset-decisions"]').forEach((button) => button.addEventListener("click", () => {
      storage(STORE, {});
      location.reload();
    }));
  }

  // ---------- xlsx: read _docs/0.requirements-analysis.xlsx (needs docs.py serve) or a picked file ----------

  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const REQS_FILE = "0.requirements-analysis.xlsx";

  // Non-empty rows of a sheet as objects keyed by header; [] when the sheet is missing.
  function sheetRows(workbook, name) {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).filter((row) => Object.values(row)[0]);
  }

  // Calls onLoad(workbook) on page load and on [data-action="reload-xlsx"].
  // The page provides an empty [data-xlsx-picker] (shown when fetch fails) and optional [data-xlsx-source].
  function loadRequirementsWorkbook(onLoad) {
    const picker = document.querySelector("[data-xlsx-picker]");
    picker.classList.add("dropzone");
    picker.innerHTML = `<p>Cannot load the xlsx automatically (page opened from disk).</p>
      <p>Run <code>python .claude/scripts/docs.py serve</code>, or pick / drop <code>${REQS_FILE}</code> here:</p>
      <input type="file" accept=".xlsx">`;

    const time = () => new Date().toLocaleTimeString();
    async function open(buffer, label) {
      if (!window.XLSX) await loadScript(XLSX_URL);
      picker.hidden = true;
      const source = document.querySelector("[data-xlsx-source]");
      if (source) source.textContent = label;
      onLoad(window.XLSX.read(buffer, { type: "array" }));
    }
    function fromFile(file) {
      if (file) file.arrayBuffer().then((buffer) => open(buffer, `${file.name} · ${time()}`));
    }
    async function fromServer() {
      let buffer;
      try {
        const response = await fetch(REQS_FILE, { cache: "no-store" });
        if (!response.ok) throw new Error(response.statusText);
        buffer = await response.arrayBuffer();
      } catch {
        picker.hidden = false;
        return;
      }
      await open(buffer, `Loaded ${time()}`);
    }

    picker.querySelector("input").addEventListener("change", (event) => fromFile(event.target.files[0]));
    picker.addEventListener("dragover", (event) => { event.preventDefault(); picker.classList.add("over"); });
    picker.addEventListener("dragleave", () => picker.classList.remove("over"));
    picker.addEventListener("drop", (event) => {
      event.preventDefault();
      picker.classList.remove("over");
      fromFile(event.dataTransfer.files[0]);
    });
    $$('[data-action="reload-xlsx"]').forEach((button) => button.addEventListener("click", fromServer));
    fromServer();
  }

  // ---------- boot ----------

  applySavedTheme();
  document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    buildToc();
    initTabs();
    initFilters();
    initFlows();
    initDecisions();
    initDecisionButtons();
    refreshDiagrams();
    themeListeners.push(refreshDiagrams);
    $$("details").forEach((details) => details.addEventListener("toggle", refreshDiagrams));
  });

  window.Doc = {
    $$, escapeHtml, storage, initTabs, buildToc, initDecisions, sheetRows, loadRequirementsWorkbook,
    onThemeChange: (fn) => themeListeners.push(fn),
  };
})();
