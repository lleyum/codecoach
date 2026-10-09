/* CodeCoach Quick review: a read-only study sheet for a topic or a session.
   Topic sheets combine the coach's key ideas (Review Notes.md) with the student's own notes: syntax drilled, patterns,
   mistakes and solutions. Session sheets list what was practiced, in order. Inside a live session the sheet sits in a
   side panel and redraws as the session goes on. */
(function () {
  "use strict";
  const CC = window.CC, S = CC.S, h = CC.h, $ = CC.$;
  const FENCE = { java: "java", python: "python", cpp: "cpp", c: "c", javascript: "javascript", go: "go", rust: "rust" };
  const lang = () => FENCE[(S.session || S.course || {}).language || (S.course || {}).language] || "";
  const code = (c, l) => "```" + (l || lang()) + "\n" + String(c || "").replace(/\s+$/, "") + "\n```";
  const cell = (t) => String(t || "").replace(/\n/g, " ");
  const R = { tab: CC.local.get("rv_tab", "topics"), q: "", sel: null, topics: null, sessions: null };

  // ---------------------------------------------------------------- topic sheet (markdown)
  const ideaCache = {};                      // topic -> {at, data}: the session panel asks often, the server only every 20 s
  async function topicData(folder, topic, fresh) {
    const k = folder + "|" + topic.toLowerCase(), c = ideaCache[k];
    if (!fresh && c && Date.now() - c.at < 20000) return c.data;
    const d = await CC.api("/api/review", { folder, topic });
    if (!d.error) ideaCache[k] = { at: Date.now(), data: d };
    return d;
  }
  function invalidate() { Object.keys(ideaCache).forEach((k) => delete ideaCache[k]); sessionChanged(); }

  function ideasMd(d, level) {
    const hh = "#".repeat(level || 2);
    if (!d.ideas || !d.ideas.length) return "";
    return d.ideas.map((x) => (d.ideas.length > 1 || x.topic.toLowerCase() !== d.topic.toLowerCase() ? hh + "# " + x.topic + "\n\n" : "") + x.markdown).join("\n\n");
  }

  function topicMd(d) {
    const t = d.tracker || {};
    const status = [t.level ? "Level " + t.level : "", /yes/i.test(t.mastered || "") ? "mastered" : t.level ? "not mastered yet" : "",
      t["next review"] ? "next review " + t["next review"] : "", t["last practiced"] ? "last practiced " + t["last practiced"] : ""].filter(Boolean).join(" · ");
    const out = ["# " + d.topic, status ? "*" + status + "*" : ""];
    const ideas = ideasMd(d, 2);
    out.push("## Key ideas", ideas || "_Your coach hasn't written key ideas for this topic yet. They appear here after your next session on it._");
    if (d.toolkit.length) {
      out.push("## Syntax you drilled", "| What | Code | Status |\n| --- | --- | --- |\n" +
        d.toolkit.map((r) => "| " + cell(r.task) + " | " + cell(r.code) + " | " + cell(r.status) + " |").join("\n"));
    }
    if (d.patterns.length) out.push("## Patterns", d.patterns.map((p) => "### " + p.name + "\n\n" + p.markdown).join("\n\n"));
    if (d.mistakes.length) {
      out.push("## Watch out", d.mistakes.map((m) => "- **" + cell(m.mistake) + "**" + (m.fix ? " → " + cell(m.fix) : "") +
        (m.example ? " (e.g. " + cell(m.example) + ")" : "") + (m["times seen"] ? " · seen " + cell(m["times seen"]) + "×" : "")).join("\n"));
    }
    if (d.solutions.length) {
      out.push("## Your solutions", d.solutions.map((s) => "### " + s.name + (s.result ? " · " + s.result : "") + "\n\n" +
        (s.statement ? s.statement.split("\n").slice(0, 4).join("\n") + "\n\n" : "") + code(s.code, FENCE[s.lang])).join("\n\n"));
    }
    if (!ideas && !d.toolkit.length && !d.patterns.length && !d.mistakes.length && !d.solutions.length && !d.tracker) {
      out.push("_Nothing on this topic yet. Study it once and this sheet fills in._");
    }
    return out.filter(Boolean).join("\n\n");
  }

  // ---------------------------------------------------------------- session sheet (markdown, from the session itself)
  function sessionTopics(s) {
    const seen = new Map();
    const add = (t) => { t = (t || "").trim(); if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); };
    add(s.topic);
    (s.problems || []).forEach((p) => add(p.topic));
    ((s.exam && s.exam.questions) || []).forEach((q) => add(q.topic));
    ((s.exam && s.exam.problems) || []).forEach((p) => add(p.topic));
    return Array.from(seen.values()).slice(0, 5);
  }

  async function sessionMd(s, live) {
    const MODES = (CC.study && CC.study.MODES) || {};
    const l = FENCE[s.course && s.course.language] || "";
    const out = ["# " + (s.title || "Session"), "*" + [(MODES[s.mode] || {}).label || s.mode, s.course && s.course.name, s.created ? CC.fmtTime(s.created) : ""].filter(Boolean).join(" · ") + "*"];
    const topics = sessionTopics(s);
    const ideas = [];
    for (const t of topics) {
      const d = await topicData(s.course.folder, t, !live);
      if (!d.error && d.ideas && d.ideas.length) ideas.push("### " + d.topic + "\n\n" + d.ideas.map((x) => x.markdown).join("\n\n"));
    }
    out.push("## Key ideas", ideas.length ? ideas.join("\n\n") : "_No key ideas written yet for " + (topics.join(", ") || "this session") + ". Your coach adds them as it teaches._");

    const items = [], byId = {};
    (s.problems || []).forEach((p) => (byId[p.id] = p));
    (s.display || []).forEach((it) => {
      if (it.kind === "drill") items.push("**Drill:** " + it.prompt + "\n\n" + code(it.reference_answer, l) + (it.correct === false ? "\n\n*You missed this one: practice it again.*" : ""));
      else if (it.kind === "quiz" && it.options) {
        const right = it.options[it.correct_index];
        items.push("**Question:** " + it.question + (it.code ? "\n\n" + code(it.code, l) : "") + "\n\nAnswer: **" + right + "**" +
          (it.chosen != null && it.chosen !== it.correct_index ? " (you picked " + it.options[it.chosen] + ")" : "") + (it.explanation ? "\n\n" + it.explanation : ""));
      } else if (it.kind === "parsons" && it.lines) items.push("**In order:** " + it.prompt + "\n\n" + code(it.lines.join("\n"), l));
      else if (it.kind === "problem" && byId[it.id]) {
        const p = byId[it.id];
        const st = p.status === "solved" ? "solved" + (p.solvedIn ? " in " + p.solvedIn : "") + (p.hints ? ", " + p.hints + " hint" + (p.hints > 1 ? "s" : "") : ", no hints")
          : p.status === "gave up" ? "gave up (worth another try)" : "still open";
        items.push("### " + p.name + " · R" + p.rung + " · " + p.topic + " · " + st + "\n\n" + String(p.statement || "").split("\n").slice(0, 6).join("\n") +
          (p.status !== "open" && p.code ? "\n\n" + (p.status === "solved" ? "Your solution:" : "Where you got to:") + "\n\n" + code(p.code, l) : ""));
      }
    });
    if (s.exam && s.exam.phase === "graded") {
      const ex = s.exam;
      ex.questions.forEach((q, i) => items.push("**Exam Q" + (i + 1) + ":** " + q.prompt + (q.code ? "\n\n" + code(q.code, l) : "") + "\n\nAnswer: **" + q.options[q.correct] + "**" +
        (ex.answers[q.id] != null && ex.answers[q.id] !== q.correct ? " (you picked " + q.options[ex.answers[q.id]] + ")" : "") + (q.explanation ? "\n\n" + q.explanation : "")));
      ex.problems.forEach((p) => items.push("### Exam: " + p.name + " · " + p.topic + "\n\n" + String(p.statement || "").split("\n").slice(0, 6).join("\n") +
        "\n\nYour code:\n\n" + code(ex.codes[p.id] || "", l) + "\n\nA model solution:\n\n" + code(p.reference || "", l)));
    }
    out.push("## What you practiced", items.length ? items.join("\n\n") : "_Nothing practiced yet in this session._");
    const notes = (s.display || []).filter((it) => it.kind === "sys" && /^(Tracker|Toolkit|Mistakes|Pattern Library) · /.test(it.text || "")).map((it) => "- " + it.text);
    if (notes.length) out.push("## Notes updated", notes.join("\n"));
    return out.join("\n\n");
  }

  // ---------------------------------------------------------------- the Quick review page
  async function show(opts) {
    opts = opts || {};
    const v = $("view-review");
    v.innerHTML = "";
    if (!S.course) { v.appendChild(h("div", { class: "page" }, h("div", { class: "page-inner" }, h("div", { class: "empty" }, h("h3", { text: "Create a course first" }))))); return; }
    if (opts.topic) { R.tab = "topics"; R.sel = { topic: opts.topic }; }
    if (opts.session) { R.tab = "sessions"; R.sel = { session: opts.session }; }
    const list = h("div", { class: "list rv-list" });
    const search = h("input", { type: "search", placeholder: "Find a topic or session", value: R.q });
    const tabs = h("div", { class: "seg" });
    const sheet = h("div", { class: "card rv-sheet" });
    v.appendChild(h("div", { class: "page" }, h("div", { class: "page-inner rv-page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", { text: "Quick review" }),
        h("div", { class: "sub", text: "A study sheet for a topic or a past session: key ideas, syntax, patterns, mistakes and your own code. Read it before a quiz, an exam or a session." }))),
      h("div", { class: "rv-layout" }, h("div", { class: "card stack rv-pick" }, tabs, search, list), sheet))));
    [["topics", "Topics"], ["sessions", "Sessions"]].forEach(([k, label]) => tabs.appendChild(h("button", { class: R.tab === k ? "on" : "", text: label,
      onclick: () => { R.tab = k; CC.local.set("rv_tab", k); tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.textContent === label)); drawList(); } })));
    search.addEventListener("input", () => { R.q = search.value; drawList(); });
    const folder = S.course.folder;
    const [tp, ss] = await Promise.all([CC.api("/api/review/topics", { folder }), CC.api("/api/sessions?" + CC.q({ folder }))]);
    R.topics = tp.topics || []; R.sessions = ss.sessions || [];
    function drawList() {
      list.innerHTML = "";
      const q = R.q.trim().toLowerCase();
      const rows = R.tab === "topics" ? R.topics.filter((t) => !q || t.topic.toLowerCase().includes(q)) : R.sessions.filter((s) => !q || (s.title || "").toLowerCase().includes(q));
      if (!rows.length) list.appendChild(h("div", { class: "hint", text: R.tab === "topics" ? "No topics yet. They appear as you study." : "No sessions yet." }));
      rows.forEach((r) => {
        const on = R.sel && (R.tab === "topics" ? R.sel.topic === r.topic : R.sel.session === r.id);
        list.appendChild(h("button", { class: "rv-row" + (on ? " on" : ""), onclick: () => { R.sel = R.tab === "topics" ? { topic: r.topic } : { session: r.id }; drawList(); drawSheet(); } },
          h("span", { class: "t", text: R.tab === "topics" ? (r.due && !r.mastered ? "● " : "") + r.topic : r.title || "Session" }),
          h("span", { class: "tiny muted", text: R.tab === "topics" ? (r.mastered ? "mastered" : r.level || "") + (r.due ? " · due" : "") : CC.fmtTime(r.updated) })));
      });
    }
    async function drawSheet() {
      sheet.innerHTML = "";
      if (!R.sel) { sheet.appendChild(h("div", { class: "empty" }, h("div", { html: CC.icon("book") }), h("h3", { text: "Pick a topic or a session" }), h("p", { text: "Topics due for review are marked ●." }))); return; }
      sheet.appendChild(h("div", { class: "row" }, h("span", { class: "dots" }, h("span"), h("span"), h("span"))));
      let md, practice = null;
      if (R.sel.topic) {
        const d = await topicData(folder, R.sel.topic, true);
        if (d.error) { sheet.textContent = d.error; return; }
        md = topicMd(d);
        practice = () => CC.go("study", { fresh: true, mode: d.tracker && /yes/i.test(d.tracker.mastered || "") ? "review" : "learn", topic: d.topic });
      } else {
        const s = S.session && S.session.id === R.sel.session ? S.session : await CC.api("/api/session?" + CC.q({ id: R.sel.session }));
        if (s.error) { sheet.textContent = s.error; return; }
        md = await sessionMd(s, false);
      }
      sheet.innerHTML = "";
      sheet.appendChild(h("div", { class: "row rv-acts" }, h("span", { class: "spacer" }),
        h("button", { class: "btn sm ghost", html: CC.icon("save") + " Copy as Markdown", onclick: () => copy(md) }),
        practice ? h("button", { class: "btn sm", html: CC.icon("play") + " Practice this", onclick: practice }) : null));
      sheet.appendChild(MD.into(h("div", { class: "md rv-md" }), md));
    }
    drawList();
    drawSheet();
  }

  function copy(md) {
    const done = () => CC.toast("Copied. Paste it into Notes, Obsidian or a doc.");
    try { navigator.clipboard.writeText(md).then(done, () => CC.toast("Couldn't copy here.", true)); } catch (e) { CC.toast("Couldn't copy here.", true); }
  }

  // ---------------------------------------------------------------- side panel in a live session
  let panelTimer = null;
  function panel() { return $("reviewPanel"); }
  async function drawPanel() {
    const p = panel(), s = S.session;
    if (!p || p.classList.contains("hidden") || !s) return;
    const body = p.querySelector(".rv-md");
    const keep = body ? body.scrollTop : 0;
    const md = await sessionMd(s, true);
    if (S.session !== s || !panel()) return;
    const fresh = MD.into(h("div", { class: "md rv-md" }), md);
    if (body) body.replaceWith(fresh); else p.appendChild(fresh);
    fresh.scrollTop = keep;
  }
  function togglePanel(btn) {
    let p = panel();
    if (!p) {
      p = h("div", { class: "review-panel hidden", id: "reviewPanel" },
        h("div", { class: "row rv-head" }, h("b", { html: CC.icon("book") + " Review sheet" }), h("span", { class: "tiny muted", text: "updates as you go" }), h("span", { class: "spacer" }),
          h("button", { class: "btn sm ghost", html: CC.icon("save") + " Copy", onclick: async () => S.session && copy(await sessionMd(S.session, true)) }),
          h("button", { class: "btn icon ghost sm", html: CC.icon("x"), title: "Close", onclick: () => togglePanel(btn) })));
      const host = document.querySelector("#view-study .split");
      if (!host) return;
      host.appendChild(p);
    }
    const open = p.classList.toggle("hidden") === false;
    if (btn) btn.classList.toggle("on", open);
    CC.local.set("reviewPanel", open);
    const ed = CC.study && CC.study.editorRef && CC.study.editorRef(); if (ed) ed.refresh();      // the editor got narrower or wider
    if (open) drawPanel();
  }
  function sessionChanged() {                       // called after every session save; cheap unless the panel is open
    const p = panel();
    if (!p || p.classList.contains("hidden")) return;
    clearTimeout(panelTimer);
    panelTimer = setTimeout(drawPanel, 700);
  }

  CC.views.review = { show };
  CC.review = { togglePanel, sessionChanged, invalidate, topicMd, sessionMd };
})();
