/* CodeCoach core: state, server calls, icons, editors, modals, navigation. */
(function () {
  "use strict";
  const CC = (window.CC = { S: {}, views: {} });
  const S = CC.S;

  // ------------------------------------------------------------------ tiny helpers
  CC.$ = (id) => document.getElementById(id);
  CC.esc = (s) => MD.esc(s);
  CC.today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  CC.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    return e;
  };
  const h = CC.h;
  CC.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  CC.fmtTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const same = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (same) return "Today " + t;
    if (d.toDateString() === y.toDateString()) return "Yesterday " + t;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
  };

  // ------------------------------------------------------------------ icons (stroke icons, lucide-style)
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17h.01"/>',
    flame: '<path d="M12 21c4 0 7-2.7 7-6.5 0-3.8-3-6-4.5-9.5-1 2.5-2.5 3.5-4 4.5C9 8 8.5 6.5 8.5 5 6 7 5 10 5 14.5 5 18.3 8 21 12 21z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V4z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    save: '<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
    logo: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
  };
  CC.icon = (name, cls) => '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || "") + "</svg>";
  CC.iconEl = (name) => { const s = document.createElement("span"); s.innerHTML = CC.icon(name); return s.firstChild; };
  CC.paintIcons = (root) => (root || document).querySelectorAll("[data-icon]").forEach((n) => { n.outerHTML = CC.icon(n.dataset.icon); });

  // ------------------------------------------------------------------ server
  CC.api = async function (path, body, signal) {
    const opts = { method: body ? "POST" : "GET", headers: { "X-CC-Token": window.CC_TOKEN }, signal };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(path, opts); } catch (e) {
      if (e.name === "AbortError") throw e;
      return { error: "CodeCoach isn't running. Start it again from the CodeCoach app, then reload this page." };
    }
    let data;
    try { data = await r.json(); } catch (e) { data = { error: "Bad response from CodeCoach (" + r.status + ")" }; }
    if (r.status === 403) data.error = "CodeCoach was restarted. Reload this page (Cmd+R) to reconnect.";
    if (!r.ok && !data.error) data.error = "HTTP " + r.status;
    return data;
  };
  CC.q = (obj) => Object.keys(obj).map((k) => k + "=" + encodeURIComponent(obj[k] == null ? "" : obj[k])).join("&");

  // ------------------------------------------------------------------ toasts & modals
  CC.toast = function (msg, bad) {
    const t = h("div", { class: "toast" + (bad ? " bad" : ""), text: msg });
    CC.$("toasts").appendChild(t);
    setTimeout(() => t.remove(), bad ? 6000 : 2600);
  };
  CC.modal = function (title, body, foot, opts) {
    opts = opts || {};
    const m = CC.$("modal");
    if (CC._onModalClose) { const f = CC._onModalClose; CC._onModalClose = null; f(); }
    m.innerHTML = "";
    const card = h("div", { class: "modal-card" + (opts.wide ? " wide" : "") },
      h("div", { class: "modal-head" }, h("h2", { text: title }), h("span", { class: "spacer" }),
        h("button", { class: "btn icon ghost", html: CC.icon("x"), onclick: CC.closeModal, title: "Close (Esc)" })),
      h("div", { class: "modal-body" }, body),
      foot ? h("div", { class: "modal-foot" }, foot) : null);
    m.appendChild(card);
    m.classList.remove("hidden");
    m.onclick = (e) => { if (e.target === m && !opts.sticky) CC.closeModal(); };
    const first = card.querySelector("input, textarea, select");
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
    return card;
  };
  CC.closeModal = () => {
    CC.$("modal").classList.add("hidden"); CC.$("modal").innerHTML = "";
    const f = CC._onModalClose; CC._onModalClose = null; if (f) f();
  };
  CC.confirm = function (title, text, okLabel, danger) {
    return new Promise((res) => {
      const ok = h("button", { class: "btn " + (danger ? "danger" : "primary"), text: okLabel || "OK", onclick: () => { CC.closeModal(); res(true); } });
      const cancel = h("button", { class: "btn ghost", text: "Cancel", onclick: () => { CC.closeModal(); res(false); } });
      CC.modal(title, h("p", { text: text, style: { margin: 0 } }), [cancel, ok]);
      setTimeout(() => ok.focus(), 30);
    });
  };
  CC.prompt = function (title, label, value) {
    return new Promise((res) => {
      const inp = h("input", { type: "text", value: value || "" });
      const done = (v) => { CC.closeModal(); res(v); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(inp.value.trim()); });
      CC.modal(title, h("div", { class: "field" }, h("label", { text: label }), inp),
        [h("button", { class: "btn ghost", text: "Cancel", onclick: () => done(null) }), h("button", { class: "btn primary", text: "Save", onclick: () => done(inp.value.trim()) })]);
    });
  };

  // ------------------------------------------------------------------ preferences & theme
  const ACCENTS = CCThemes.ACCENTS;
  CC.ACCENTS = ACCENTS;
  CC.prefs = (() => { try { return JSON.parse(localStorage.getItem("cc_prefs") || "{}"); } catch (e) { return {}; } })();
  // migrate v2.0 prefs (theme was light/dark/system, accent defaulted to indigo)
  if (CC.prefs.theme === "light") CC.prefs.theme = "paper";
  if (CC.prefs.theme === "dark") CC.prefs.theme = "midnight";
  CC.savePrefs = () => { try { localStorage.setItem("cc_prefs", JSON.stringify(CC.prefs)); } catch (e) {} CC.applyPrefs(); };
  const sysDark = () => !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  /** The theme that should be showing now (follows the OS light/dark setting when theme = "system"). */
  CC.currentTheme = function () {
    const p = CC.prefs, by = CCThemes.byId;
    if (!p.theme || p.theme === "system") return sysDark() ? (by[p.darkTheme] || by.midnight) : (by[p.lightTheme] || by.paper);
    return by[p.theme] || by.paper;
  };
  CC.applyTheme = function (t, accent) {
    const acc = accent === undefined ? (ACCENTS[CC.prefs.accent] || null) : accent;
    CCThemes.apply(t, acc);
  };
  CC.applyPrefs = function () {
    const p = CC.prefs, root = document.documentElement;
    CC.applyTheme(CC.currentTheme());
    root.style.setProperty("--ui-size", (p.uiSize || 14.5) + "px");
    root.style.setProperty("--editor-size", (p.editorSize || 14) + "px");
    root.style.setProperty("--mono", p.mono || '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace');
    (CC.editors || []).forEach((e) => e.refresh());
  };
  CC.local = {
    get(k, d) { try { const v = localStorage.getItem("cc_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cc_" + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ------------------------------------------------------------------ editors
  const CM_MODE = { java: "text/x-java", cpp: "text/x-c++src", c: "text/x-csrc", python: "python", javascript: "javascript", go: "go", rust: "rust" };
  CC.editors = [];
  CC.makeEditor = function (host, lang, keys) {
    keys = keys || {};
    let ed;
    if (window.CodeMirror) {
      const extra = {
        Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("    ", "end")),
        "Shift-Tab": (c) => c.indentSelection("subtract"),
        "Cmd-/": "toggleComment", "Ctrl-/": "toggleComment",
      };
      const bind = (combo, fn) => { if (fn) { extra["Cmd-" + combo] = fn; extra["Ctrl-" + combo] = fn; } };
      bind("Enter", keys.run); bind("Shift-Enter", keys.submit); bind("S", keys.save);
      const cm = window.CodeMirror(host, {
        value: "", mode: CM_MODE[lang] || "text/x-java", lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
        matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, viewportMargin: 50, extraKeys: extra, lineWrapping: false,
      });
      ed = {
        cm, get: () => cm.getValue(), set: (v) => { cm.setValue(v || ""); cm.clearHistory(); },
        mode: (l) => cm.setOption("mode", CM_MODE[l] || "text/x-java"), refresh: () => setTimeout(() => cm.refresh(), 0), focus: () => cm.focus(),
        onChange: (f) => cm.on("change", f),
        format: () => { const n = cm.lineCount(); cm.operation(() => { for (let i = 0; i < n; i++) cm.indentLine(i, "smart"); }); },
      };
    } else {
      const ta = h("textarea", { class: "fallback", spellcheck: "false" });
      host.appendChild(ta);
      ta.addEventListener("keydown", (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; }
        if (mod && e.key === "Enter" && e.shiftKey && keys.submit) { e.preventDefault(); keys.submit(); }
        else if (mod && e.key === "Enter" && keys.run) { e.preventDefault(); keys.run(); }
        if (mod && e.key.toLowerCase() === "s" && keys.save) { e.preventDefault(); keys.save(); }
      });
      ed = { get: () => ta.value, set: (v) => { ta.value = v || ""; }, mode: () => {}, refresh: () => {}, focus: () => ta.focus(),
        onChange: (f) => ta.addEventListener("input", f), format: () => {} };
    }
    CC.editors.push(ed);
    return ed;
  };

  // ------------------------------------------------------------------ app state & navigation
  CC.lang = (k) => (S.state && S.state.languages[k]) || { label: k, tests: false, available: false };
  CC.course = () => S.course;
  CC.coachName = () => ((S.state && S.state.config && S.state.config.coach_name) || "Coach").trim() || "Coach";
  CC.coachAvatar = () => { const n = CC.coachName(); return n.toLowerCase() === "coach" ? CC.icon("logo") : "<b>" + MD.esc(n.charAt(0).toUpperCase()) + "</b>"; };

  CC.go = function (view, opts) {
    S.view = view;
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
    ["today", "study", "materials", "playground", "progress", "guide", "welcome"].forEach((v) => CC.$("view-" + v).classList.toggle("hidden", v !== view));
    const gb = CC.$("guideBtn"); if (gb) gb.classList.toggle("on", view === "guide");
    const wb = CC.$("welcomeBtn"); if (wb) wb.classList.toggle("on", view === "welcome");
    if (CC.views[view] && CC.views[view].show) CC.views[view].show(opts || {});
    CC.local.set("view", view);
  };

  CC.refreshState = async function () {
    S.state = await CC.api("/api/state");
    if (S.state.error) { CC.toast(S.state.error, true); return; }
    const sel = CC.$("courseSelect");
    sel.innerHTML = "";
    (S.state.courses || []).forEach((c) => sel.appendChild(h("option", { value: c.folder, text: c.name + (c.type === "general" ? "  (track)" : "") })));
    if (!(S.state.courses || []).length) sel.appendChild(h("option", { value: "", text: "No courses yet" }));
    const saved = CC.local.get("course", null);
    S.course = (S.state.courses || []).find((c) => c.folder === (S.course && S.course.folder)) ||
      (S.state.courses || []).find((c) => c.folder === saved) || (S.state.courses || [])[0] || null;
    if (S.course) sel.value = S.course.folder;
    CC.renderModelSelect();
  };

  const MODELS = [
    ["deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash (cheap)"],
    ["z-ai/glm-5.3-flash", "GLM 5.3 Flash (cheap)"],
    ["z-ai/glm-5.3", "GLM 5.3"],
    ["moonshotai/kimi-k3", "Kimi K3 (best)"],
    ["thinkingmachines/inkling:free", "Inkling (free)"],
    ["qwen/qwen3.8-27b:free", "Qwen 3.8 27B (free)"],
  ];
  CC.MODELS = MODELS;
  // sidebar AI switcher: recent AI lines (any provider) + curated OpenRouter models
  CC.rememberAI = function (line) {
    if (!line) return;
    const rec = (CC.local.get("ai_recent", []) || []).filter((x) => x !== line);
    rec.unshift(line); CC.local.set("ai_recent", rec.slice(0, 6));
  };
  CC.renderModelSelect = function () {
    const sel = CC.$("modelSelect"), ai = S.state.ai || {}, cur = ai.line || "";
    sel.innerHTML = "";
    const lines = [];
    const add = (l) => { if (l && !lines.includes(l)) lines.push(l); };
    add(cur); (CC.local.get("ai_recent", []) || []).forEach(add);
    if (ai.id === "openrouter") MODELS.forEach((m) => add("openrouter:" + m[0]));
    const nice = (l) => { const m = MODELS.find((x) => "openrouter:" + x[0] === l); return m ? m[1] : CC.aiLabel ? CC.aiLabel(l) : l; };
    lines.forEach((l) => sel.appendChild(h("option", { value: l, text: nice(l) })));
    sel.appendChild(h("option", { value: "__settings", text: "Other model or provider..." }));
    sel.value = cur;
    sel.title = "AI: " + cur + (ai.local ? " (runs on this computer)" : "");
  };
  CC.usageLine = async function () {
    if (!S.course) return;
    const ai = S.state.ai || {};
    if (ai.local) { CC.$("usageLine").textContent = "local AI · free · private"; return; }
    if (ai.id !== "openrouter") { CC.$("usageLine").textContent = ai.label + " · billed by " + ai.label; return; }
    const d = await CC.api("/api/dashboard?" + CC.q({ folder: S.course.folder }));
    if (!d.error) CC.$("usageLine").textContent = "$" + (d.today_cost || 0).toFixed(3) + " today  ·  $" + (d.week_cost || 0).toFixed((d.week_cost || 0) < 1 ? 3 : 2) + " this week";
  };
  CC.fileManager = () => (/Mac/i.test(navigator.platform) ? "Finder" : /Win/i.test(navigator.platform) ? "Explorer" : "file manager");
  // native folder chooser: the Mac app window answers directly; otherwise the server opens the system dialog
  CC.pickFolder = function (prompt, start) {
    try {
      if (window.CC_NATIVE_V >= 2 && window.webkit && window.webkit.messageHandlers.cc) {
        return new Promise((res) => { CC._folderPicked = (p) => { CC._folderPicked = null; res(p || ""); }; window.webkit.messageHandlers.cc.postMessage({ pickFolder: prompt || "Choose a folder", start: start || "" }); });
      }
    } catch (e) { /* fall through */ }
    return CC.api("/api/pick_folder", { prompt, start }).then((r) => (r && r.path) || "");
  };

  CC.setCourse = function (folder) {
    S.course = (S.state.courses || []).find((c) => c.folder === folder) || null;
    CC.local.set("course", folder);
    CC.$("courseSelect").value = folder;
    CC.go(S.view || "today");
    CC.usageLine();
  };

  // ------------------------------------------------------------------ Windows/Linux: show Ctrl instead of Mac key symbols
  CC.IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function localizeKeys() {
    if (CC.IS_MAC) return;
    const fixText = (t) => t.replace(/⇧\s*⌘\s*/g, "Ctrl+Shift+").replace(/⌘⇧/g, "Ctrl+Shift+").replace(/⌘\s*/g, "Ctrl+").replace(/⇧\s*/g, "Shift+")
      .replace(/↵/g, "Enter").replace(/\bCmd\+/g, "Ctrl+").replace(/\bShift\+Cmd\+/g, "Ctrl+Shift+");
    const walk = (root) => {
      if (root.nodeType === 3) { if (/[⌘⇧↵]|Cmd\+/.test(root.nodeValue)) root.nodeValue = fixText(root.nodeValue); return; }
      if (root.nodeType !== 1) return;
      ["title", "placeholder"].forEach((a) => { const v = root.getAttribute && root.getAttribute(a); if (v && /[⌘⇧↵]|Cmd\+/.test(v)) root.setAttribute(a, fixText(v)); });
      root.childNodes.forEach(walk);
    };
    walk(document.body);
    new MutationObserver((ms) => ms.forEach((m) => { m.addedNodes.forEach(walk); if (m.type === "characterData") walk(m.target); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ------------------------------------------------------------------ init
  // ------------------------------------------------------------------ diagnostics for the Mac window's log (~/.codecoach/window.log)
  // If macOS ends the page's process, the log then says how big the page was and whether the Mac was short on memory.
  const nativeLog = (msg) => { try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cc) window.webkit.messageHandlers.cc.postMessage(msg); } catch (e) { /* not the Mac app */ } };
  const startedAt = Date.now();
  function pageStats() {
    let sessKB = 0;
    try { if (S.session) sessKB = Math.round(JSON.stringify(S.session).length / 1024); } catch (e) { /* ignore */ }
    const chat = document.getElementById("chat");
    return "view " + (S.view || "?") + ", " + document.getElementsByTagName("*").length + " page elements, " + (chat ? chat.children.length : 0) + " chat items, session " + sessKB + " KB, editors " +
      (CC.editors || []).length + ", page open " + Math.round((Date.now() - startedAt) / 60000) + " min";
  }
  let jsErrors = 0;
  window.addEventListener("error", (e) => { if (jsErrors++ < 20) nativeLog({ jsError: (e.message || "error") + " @ " + (e.filename || "").split("/").pop() + ":" + (e.lineno || 0) }); });
  window.addEventListener("unhandledrejection", (e) => { if (jsErrors++ < 20) nativeLog({ jsError: "promise: " + String((e.reason && (e.reason.message || e.reason)) || "rejected").slice(0, 300) }); });

  CC.init = async function () {
    localizeKeys();
    CC.applyPrefs();
    CC.$("logoIcon").innerHTML = CC.icon("logo");
    CC.$("newCourseBtn").innerHTML = CC.icon("plus");
    CC.paintIcons();
    await CC.refreshState();
    document.querySelectorAll("#nav button").forEach((b) => (b.onclick = () => CC.go(b.dataset.view)));
    CC.$("courseSelect").onchange = (e) => {
      if (S.session && S.busy) { CC.toast("Wait for the coach to finish first."); e.target.value = S.course.folder; return; }
      CC.setCourse(e.target.value);
    };
    CC.$("newCourseBtn").onclick = () => CC.views.newCourse();
    CC.$("settingsBtn").onclick = () => CC.views.settings();
    CC.$("themesBtn").onclick = () => CC.views.themes();
    CC.$("guideBtn").onclick = () => CC.go("guide");
    CC.$("welcomeBtn").onclick = () => CC.go("welcome");
    CC.updateMuteBtn = () => {
      const snd = Object.assign({}, CC.soundDefaults || {}, CC.prefs.sound || {}), b = CC.$("muteBtn"); if (!b) return;
      b.innerHTML = CC.icon(snd.muted ? "mute" : "volume") + '<span class="label-text">' + (snd.muted ? "Sound off" : "Sound on") + "</span>";
      b.classList.toggle("muted", !!snd.muted);
    };
    CC.toggleMute = () => { CC.prefs.sound = Object.assign({}, CC.soundDefaults || {}, CC.prefs.sound || {}); CC.prefs.sound.muted = !CC.prefs.sound.muted; CC.savePrefs(); CC.updateMuteBtn(); CC.toast(CC.prefs.sound.muted ? "Sounds muted" : "Sounds on"); if (!CC.prefs.sound.muted) CC.sfx && CC.sfx.play("toggle", true); };
    CC.$("muteBtn").onclick = CC.toggleMute;
    CC.updateMuteBtn();
    CC.$("modelSelect").onchange = async (e) => {
      const line = e.target.value;
      if (line === "__settings") { CC.renderModelSelect(); return CC.views.settings(null, "ai"); }
      const r = await CC.api("/api/config", { ai: line });
      if (r.error) return CC.toast(r.error, true);
      CC.rememberAI(line);
      await CC.refreshState();
      if (S.session) S.sys = null;
      CC.toast("AI: " + CC.aiLabel(line) + (S.state.has_key ? "" : " - add its API key in Settings"), !S.state.has_key);
      CC.usageLine();
    };
    document.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape" && !CC.$("modal").classList.contains("hidden")) CC.closeModal();
      if (mod && ["1", "2", "3", "4", "5"].includes(e.key)) { e.preventDefault(); CC.go(["today", "study", "materials", "playground", "progress"][+e.key - 1]); }
      if (mod && e.key === ",") { e.preventDefault(); CC.views.settings(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); CC.views.themes(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); CC.toggleMute(); }
    });
    window.addEventListener("beforeunload", () => { if (CC.flushSave) CC.flushSave(); });
    // dropping a file anywhere except the Materials drop zone must not open it in place of the app
    window.addEventListener("dragover", (e) => { if (!e.defaultPrevented) { e.preventDefault(); e.dataTransfer.dropEffect = "none"; } });
    window.addEventListener("drop", (e) => { if (!e.defaultPrevented) e.preventDefault(); });
    setInterval(() => fetch("/api/ping").catch(() => {}), 60000);   // lets the server know a window is open (it auto-quits otherwise)
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => CC.applyPrefs());
    Object.values(CC.views).forEach((v) => v && v.init && v.init());
    CC.rememberAI(S.state.ai && S.state.ai.line);
    if (S.state.first_run) setTimeout(() => CC.views.setup(), 200);
    else if (S.state.vault_readable === false) setTimeout(() => CC.modal("CodeCoach can't read your Library",
      h("p", { html: "macOS is blocking CodeCoach from the folder your Library is in (" + MD.esc(S.state.library) + "), so your courses don't show up.<br><br><b>Fix:</b> open System Settings &gt; Privacy &amp; Security &gt; Files and Folders and allow CodeCoach, then reopen it. Or move the Library out of Documents (Settings &gt; Library &amp; sync)." }),
      [h("button", { class: "btn primary", text: "OK", onclick: CC.closeModal })]), 300);
    else if (!S.state.has_key) setTimeout(() => CC.toast("Pick your AI to start: Settings > AI & coach (free local models work too)."), 900);
    // come back to exactly where you were: the open session if there was one, otherwise the last page
    const lastView = CC.local.get("view", "today"), openSid = CC.local.get("openSession", null);
    const goLast = () => CC.go(["today", "study", "materials", "playground", "progress", "guide", "welcome"].includes(lastView) ? lastView : "today");
    if (openSid && CC.resumeSession && S.state.has_key !== undefined) {
      CC.resumeSession(openSid, { quiet: true, reload: true }).then(() => { if (!S.session) { CC.local.set("openSession", null); goLast(); } })
        .catch(() => { CC.local.set("openSession", null); goLast(); });
    } else goLast();
    if (window.CC_NATIVE) {
      setInterval(() => nativeLog({ stats: pageStats() }), 3 * 60000);
      document.addEventListener("visibilitychange", () => { if (document.hidden) nativeLog({ stats: pageStats() }); });
    }
    if (/[?&]recovered=1/.test(location.search)) {
      try { history.replaceState(null, "", "/"); } catch (e) { /* ignore */ }
      setTimeout(() => CC.toast("macOS restarted CodeCoach's page (usually to free memory). Your session, code and draft are back where you left them."), 900);
    }
    if (!CC.local.get("guide_seen", false)) { CC.local.set("guide_seen", true); setTimeout(() => CC.toast("New: \"How to use\" in the sidebar explains everything CodeCoach does."), 1200); }
    CC.usageLine();
  };
})();
