/* CodeCoach exam mode: a whole practice exam built up front, then taken with no AI, no help and a real clock.
   Phases: building -> ready -> running -> graded. After grading the session becomes a normal chat for the debrief. */
(function () {
  "use strict";
  const CC = window.CC, S = CC.S, h = CC.h, $ = CC.$;
  const ST = () => CC.study;
  const L = () => S.session.course.language;
  // save a session even when it's no longer the open one (e.g. an exam finished building after the student left it)
  async function saveSession(s) {
    if (S.session === s) return ST().saveNow();
    const r = await CC.api("/api/session/save", s);
    if (r && r.rev) s.rev = r.rev;
  }
  const fence = (code) => "```" + ST().fenceLang() + "\n" + code + "\n```";
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const mins = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s"; };

  const BUILD_EXAM = { type: "function", function: { name: "build_exam",
    description: "Create the whole practice exam at once. Coding problems are checked: the reference must pass the tests and the starter must not.",
    parameters: { type: "object", properties: {
      title: { type: "string", description: "Short exam title, e.g. 'Week 6 quiz: Maps and Sets'" },
      questions: { type: "array", description: "Multiple-choice questions", items: { type: "object", properties: {
        topic: { type: "string" }, prompt: { type: "string", description: "Markdown question" }, code: { type: "string", description: "Optional code shown with the question" },
        options: { type: "array", items: { type: "string" } }, correct_index: { type: "integer" }, explanation: { type: "string", description: "Shown only after grading" },
        points: { type: "number" } }, required: ["topic", "prompt", "options", "correct_index", "explanation"] } },
      problems: { type: "array", description: "Coding problems", items: { type: "object", properties: {
        name: { type: "string" }, topic: { type: "string" }, statement: { type: "string", description: "Markdown statement with examples, in the course's style" },
        starter_code: { type: "string" }, reference_solution: { type: "string" }, test_code: { type: "string" }, points: { type: "number" } },
        required: ["name", "topic", "statement", "starter_code", "reference_solution", "test_code"] } } },
      required: ["title", "questions", "problems"] } } };

  // ================================================================== setup (start screen)
  function setupCard() {
    const num = (v, min, max) => h("input", { type: "number", value: String(v), min: String(min), max: String(max), style: { width: "80px" } });
    const last = CC.local.get("examSpec", {}) || {};
    const minutes = num(last.minutes || 50, 5, 180), mc = num(last.mc != null ? last.mc : 6, 0, 30), coding = num(last.coding != null ? last.coding : 2, 0, 6);
    const lock = h("input", { type: "checkbox" }); lock.checked = last.lockdown !== false;
    const card = h("div", { class: "card stack exam-setup" },
      h("div", { class: "label", text: "Exam" }),
      h("div", { class: "row wrap" },
        h("label", { class: "field" }, h("span", { text: "Minutes" }), minutes),
        h("label", { class: "field" }, h("span", { text: "Multiple choice" }), mc),
        h("label", { class: "field" }, h("span", { text: "Coding problems" }), coding)),
      h("label", { class: "row small" }, lock, h("span", { text: "Lockdown: full screen, no coach, no Playground, test results show counts only" })),
      h("div", { class: "hint", text: "The coach builds the whole exam first (topics from the box below, or from your tracker and class blueprint), checks every coding problem, then the clock starts when you press Start. No AI during the exam. Graded on this computer, then the coach goes through it with you." }));
    card.read = () => {
      const spec = { minutes: Math.min(180, Math.max(5, +minutes.value || 50)), mc: Math.min(30, Math.max(0, +mc.value || 0)),
        coding: Math.min(6, Math.max(0, +coding.value || 0)), lockdown: lock.checked };
      if (!spec.mc && !spec.coding) spec.mc = 5;
      CC.local.set("examSpec", spec);
      return spec;
    };
    return card;
  }

  // ================================================================== building
  async function start(topics, materialPaths, pasted, spec) {
    const c = S.course;
    if (S.session && !(await ST().leaveSession())) return;
    const title = topics ? "Exam: " + topics : "Practice exam";
    const r = await CC.api("/api/note/session_start", { folder: c.folder, title, mode: "Exam" });
    if (r.error) return CC.toast(r.error, true);
    S.session = { id: ST().newId(), title, mode: "exam", topic: topics || "", note: r.note, materials: materialPaths,
      course: { name: c.name, folder: c.folder, language: c.language, type: c.type },
      messages: [], display: [], problems: [], usage: { cost: 0, tokens: 0 }, created: new Date().toISOString(),
      exam: { phase: "building", spec, topics: topics || "", pasted: pasted || "" } };
    await ST().saveNow();
    render();
    build();
  }

  const building = new Set();              // ids of sessions whose exam is being written right now
  async function build() {
    const s = S.session, ex = s.exam;
    if (building.has(s.id)) return;
    building.add(s.id);
    ex.phase = "building"; ex.buildError = ""; render();
    const status = (t) => { if (S.session === s) setStatus(t); };
    try {
      const sp = await CC.api("/api/system_prompt?" + CC.q({ folder: s.course.folder, mode: "exam", topic: ex.topics || "" }));
      if (sp.error) throw new Error(sp.error);
      let mats = "";
      for (const p of s.materials || []) {
        const m = await CC.api("/api/material?" + CC.q({ folder: s.course.folder, path: p }));
        if (!m.error) mats += "\n\n--- " + p + " (" + (m.meta.title || "") + ", " + (m.meta.type || "") + ") ---\n" + m.content;
      }
      if (ex.pasted) mats += "\n\n--- pasted ---\n" + ex.pasted;
      const spec = ex.spec;
      const msgs = [{ role: "system", content: sp.prompt }, { role: "user", content:
        "[BUILD EXAM] Build a " + spec.minutes + "-minute practice exam with " + spec.mc + " multiple-choice question(s) and " + spec.coding + " coding problem(s). " +
        "Topics: " + (ex.topics || "choose from my tracker (due and recently learned topics first) and the class blueprint") + ". " +
        "Match my class's real assessment format, difficulty and conventions from the blueprint and materials (general track: a mixed test at my level). " +
        "Coding problems use the course language and the usual test helpers; the starter must NOT pass the tests. Every problem must be new (never one from my materials). " +
        "Questions should trace code, spot bugs and test concepts I'll actually be assessed on, with plausible wrong options. " +
        "Call build_exam exactly once with everything. Write no other text." + (mats ? "\n\nMaterials (format and topic seed only):" + mats.slice(0, 45000) : "") }];
      let exam = null, notes = [];
      for (let attempt = 0; attempt < 3 && !exam; attempt++) {
        status(attempt ? "Fixing " + notes.length + " problem" + (notes.length > 1 ? "s" : "") + " the checker found..." : "Writing your exam...");
        const res = await CC.api("/api/llm", { messages: msgs, tools: [BUILD_EXAM] });
        if (res.error) throw new Error(res.error);
        addUsage(s, res.usage);
        const call = ((res.message || {}).tool_calls || []).find((t) => t.function && t.function.name === "build_exam");
        msgs.push(Object.assign({ role: "assistant", content: (res.message || {}).content || "" }, res.message && res.message.tool_calls ? { tool_calls: res.message.tool_calls } : {}));
        if (!call) { msgs.push({ role: "user", content: "Call build_exam with the whole exam." }); notes = ["no build_exam call"]; continue; }
        let a;
        try { a = JSON.parse(call.function.arguments || "{}"); } catch (e) { notes = ["arguments were not valid JSON: " + e.message]; }
        if (a) {
          const v = await validate(a, s.course.language, status);
          notes = v.errors;
          if (!v.errors.length || (attempt === 2 && v.exam.questions.length + v.exam.problems.length)) exam = v.exam;
        }
        if (!exam) msgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ rejected: notes, instruction: "Fix these and call build_exam again with the WHOLE exam." }) });
      }
      if (!exam) throw new Error("The AI couldn't build a valid exam (" + notes.slice(0, 3).join("; ") + "). Try again, or try a different model.");
      Object.assign(ex, exam, { phase: "ready", answers: {}, codes: {}, runs: {}, timeOn: {}, away: [], fsExits: 0, dropped: notes.length ? notes : undefined });
      ex.problems.forEach((p) => { ex.codes[p.id] = p.starter; });
      s.title = exam.title || s.title;
    } catch (e) {
      ex.buildError = e.message;
    } finally {
      building.delete(s.id);
      await saveSession(s);
      if (S.session === s) render();
    }
  }

  function addUsage(s, u) {
    if (!u) return;
    const us = s.usage;
    us.cost += Number(u.cost || 0);
    if (u.cost_estimated) us.estimated = true;
    us.tokens += Number(u.prompt_tokens || 0) + Number(u.completion_tokens || 0);
  }

  async function validate(a, lang, status) {
    const errors = [], out = { title: String(a.title || "Practice exam"), questions: [], problems: [] };
    (a.questions || []).forEach((q, i) => {
      const opts = (q.options || []).map(String);
      if (!q.prompt || opts.length < 2 || opts.length > 8) return errors.push("question " + (i + 1) + ": needs a prompt and 2-8 options");
      if (!(q.correct_index >= 0 && q.correct_index < opts.length)) return errors.push("question " + (i + 1) + ": correct_index is out of range");
      out.questions.push({ id: "q" + (i + 1), topic: q.topic || "", prompt: q.prompt, code: q.code || "", options: opts, correct: q.correct_index,
        explanation: q.explanation || "", points: Number(q.points) > 0 ? Number(q.points) : 1 });
    });
    const probs = a.problems || [];
    for (let i = 0; i < probs.length; i++) {
      const p = probs[i];
      status("Checking coding problem " + (i + 1) + " of " + probs.length + "...");
      const ref = await CC.api("/api/run_tests", { language: lang, code: p.reference_solution || "", tests: p.test_code || "" });
      if (!ref.ok) { errors.push("problem " + (i + 1) + " (" + p.name + "): the reference solution fails its tests (" + (ref.stage || "") + "): " + String(ref.message || ref.error || "").slice(0, 1500)); continue; }
      const st = await CC.api("/api/run_tests", { language: lang, code: p.starter_code || "", tests: p.test_code || "" });
      if (st.ok) { errors.push("problem " + (i + 1) + " (" + p.name + "): the starter code already passes every test"); continue; }
      out.problems.push({ id: "p" + (i + 1), name: p.name || "Problem " + (i + 1), topic: p.topic || "", statement: p.statement || "", starter: p.starter_code || "",
        reference: p.reference_solution, tests: p.test_code, total: ref.total || 0, points: Number(p.points) > 0 ? Number(p.points) : 3 });
    }
    return { errors, exam: out };
  }

  // ================================================================== screens
  let timerIv = null, endTo = null, awayAt = null, curAt = null, ed = null, liveId = null;
  const items = () => { const ex = S.session.exam; return ex.questions.map((q) => ({ id: q.id, kind: "mc", q })).concat(ex.problems.map((p) => ({ id: p.id, kind: "code", p }))); };

  function shell(inner) {
    const v = ST().view();
    v.innerHTML = "";
    v.appendChild(h("div", { class: "page" }, h("div", { class: "page-inner exam-page" }, inner)));
  }
  function setStatus(t) { const n = $("examStatus"); if (n) n.textContent = t; }

  function render() {
    const s = S.session; if (!s || !s.exam) return;
    const ex = s.exam;
    CC.local.set("openSession", s.id);
    $("studyBadge").classList.remove("hidden");
    if (ex.phase === "running") return liveId === s.id ? renderRunning() : resume();
    lockdown(false);
    const close = h("button", { class: "btn ghost", html: CC.icon("x") + " Close", onclick: async () => { if (await ST().leaveSession()) ST().renderStart({ mode: "exam" }); } });
    if (ex.phase === "building") {
      shell(h("div", { class: "card stack exam-card" },
        h("h1", { text: s.title }),
        ex.buildError ? h("div", { class: "msg err" }, h("span", { text: ex.buildError })) : h("div", { class: "row" }, h("span", { class: "dots" }, h("span"), h("span"), h("span")), h("span", { id: "examStatus", class: "muted", text: "Writing your exam..." })),
        h("p", { class: "muted small", text: "The coach writes the whole exam now and every coding problem is checked against its own tests, so nothing needs the AI once you start. This takes a minute or two." }),
        h("div", { class: "row" }, ex.buildError || !building.has(s.id) ? h("button", { class: "btn primary", html: CC.icon("refresh") + " " + (ex.buildError ? "Try again" : "Build the exam"), onclick: build }) : null, h("span", { class: "spacer" }), close)));
      return;
    }
    // ready
    const n = ex.questions.length, m = ex.problems.length;
    const pts = ex.questions.reduce((a, q) => a + q.points, 0) + ex.problems.reduce((a, p) => a + p.points, 0);
    shell(h("div", { class: "card stack exam-card" },
      h("div", { class: "label", text: "Practice exam · " + s.course.name }),
      h("h1", { text: s.title }),
      h("div", { class: "exam-facts" },
        fact(ex.spec.minutes + " min", "time"), fact(String(n), "multiple choice"), fact(String(m), "coding"), fact(String(pts), "points")),
      h("ul", { class: "exam-rules" },
        h("li", { text: "The clock starts when you press Start and keeps running if you leave or close CodeCoach. At 0:00 the exam is submitted automatically." }),
        h("li", { text: "No coach, hints or Playground until you submit. Run tests as often as you like" + (ex.spec.lockdown ? ": you'll see how many pass, not which." : ".") }),
        ex.spec.lockdown ? h("li", { text: "Full screen. Leaving the window or full screen is noted in your report (nothing else happens)." }) : null,
        h("li", { text: "Partial credit for coding problems: points × tests passed." })),
      ex.dropped ? h("div", { class: "hint", text: "Some items didn't pass the checker and were left out." }) : null,
      h("div", { class: "row" }, h("button", { class: "btn primary", html: CC.icon("play") + " Start exam", onclick: begin }), h("span", { class: "spacer" }), close)));
  }
  const fact = (big, small) => h("div", null, h("b", { text: big }), h("span", { text: small }));

  function begin() {
    const ex = S.session.exam;
    ex.phase = "running"; ex.startedAt = Date.now(); ex.endsAt = ex.startedAt + ex.spec.minutes * 60000;
    ex.current = items()[0] && items()[0].id;
    liveId = S.session.id;
    CC.sfx && CC.sfx.play("toggle");
    ST().saveNow();
    renderRunning();
    if (ex.spec.lockdown) fullscreen(true);
  }

  // ---- lockdown: full screen, no navigation; leaving is logged, not punished
  function lockdown(on) {
    document.body.classList.toggle("exam-lock", !!on);
  }
  function nativeFS() { try { return window.CC_NATIVE_V >= 3 && window.webkit && window.webkit.messageHandlers.cc; } catch (e) { return null; } }
  function fullscreen(on) {
    const n = nativeFS();
    if (n) { n.postMessage({ fullscreen: on }); return; }
    try {
      if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* not available */ }
  }
  function fsLeft() {
    const s = S.session;
    if (!s || !s.exam || s.exam.phase !== "running" || !s.exam.spec.lockdown || !document.body.classList.contains("exam-lock")) return;
    s.exam.fsExits = (s.exam.fsExits || 0) + 1;
    const b = $("examFs"); if (b) b.classList.remove("hidden");
    ST().scheduleSave(0);
  }
  CC._nativeFullscreen = (on) => { if (!on) fsLeft(); else { const b = $("examFs"); if (b) b.classList.add("hidden"); } };
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) fsLeft(); else { const b = $("examFs"); if (b) b.classList.add("hidden"); } });
  const running = () => S.session && S.session.exam && S.session.exam.phase === "running";
  function away(start) {
    if (!running()) { awayAt = null; return; }
    if (start) { if (!awayAt) awayAt = Date.now(); trackItem(); return; }
    if (awayAt) {
      const ms = Date.now() - awayAt; awayAt = null;
      if (ms > 1500) { S.session.exam.away.push({ at: new Date(Date.now() - ms).toISOString(), ms }); ST().scheduleSave(0); }
    }
    if (document.querySelector(".exam-body")) curAt = Date.now();
    tick();
  }
  document.addEventListener("visibilitychange", () => {
    away(document.hidden);
    if (document.hidden && running()) {                    // flush the answers before the window may be closed
      if (ed && ed.pid === S.session.exam.current) S.session.exam.codes[ed.pid] = ed.get();
      ST().saveNow();
    }
  });
  window.addEventListener("blur", () => away(true));
  window.addEventListener("focus", () => away(false));

  // ---- time on each item (only while it's on screen and the window is in front)
  function trackItem() {
    const ex = S.session && S.session.exam;
    if (!ex || !ex.current || !curAt) return;
    ex.timeOn[ex.current] = (ex.timeOn[ex.current] || 0) + (Date.now() - curAt);
    curAt = null;
  }

  function tick() {
    if (!running()) return;
    const ex = S.session.exam, left = ex.endsAt - Date.now();
    const t = $("examClock");
    if (t) { t.textContent = mmss(left); t.classList.toggle("warn", left < 5 * 60000); t.classList.toggle("bad", left < 60000); }
    if (left <= 0) submit(true);
  }
  function startClock() {
    clearInterval(timerIv); clearTimeout(endTo);
    timerIv = setInterval(() => { if (!document.hidden) tick(); }, 1000);
    endTo = setTimeout(tick, Math.max(0, S.session.exam.endsAt - Date.now()) + 50);
  }
  function stopClock() { clearInterval(timerIv); clearTimeout(endTo); timerIv = endTo = null; }

  function renderRunning() {
    const s = S.session, ex = s.exam;
    ed = null; curAt = null; liveId = s.id;
    lockdown(ex.spec.lockdown);
    const v = ST().view();
    v.innerHTML = "";
    const nav = h("div", { class: "exam-nav" });
    const main = h("div", { class: "exam-main" });
    const answered = h("span", { class: "chip", id: "examCount" });
    const submitBtn = h("button", { class: "btn primary", html: CC.icon("check") + " Submit exam", onclick: async () => {
      const left = items().filter((it) => !isDone(it)).length;
      if (await CC.confirm("Submit the exam?", (left ? left + " item" + (left > 1 ? "s look" : " looks") + " unanswered. " : "") + "You can't change answers after submitting.", "Submit")) submit(false);
    } });
    const leave = h("button", { class: "btn ghost sm", text: "Leave", title: "Close the exam screen. The clock keeps running.", onclick: async () => {
      if (!(await CC.confirm("Leave the exam?", "The clock keeps running while you're away, like a real exam. Open this session again to continue.", "Leave"))) return;
      if (ed && ed.pid === ex.current) ex.codes[ed.pid] = ed.get();
      trackItem(); stopClock(); lockdown(false); fullscreen(false); ed = null; liveId = null; curAt = null;
      if (await ST().leaveSession()) ST().renderStart();
    } });
    v.appendChild(h("div", { class: "sess-bar exam-bar" }, h("div", { class: "title", text: s.title }), h("span", { class: "chip accent", text: "Exam" }),
      h("span", { class: "spacer" }), answered, h("span", { class: "exam-clock", id: "examClock" }), submitBtn, leave));
    v.appendChild(h("div", { class: "pause-banner hidden", id: "examFs" }, h("span", { text: "You left full screen (noted in your report)." }), h("span", { class: "spacer" }),
      h("button", { class: "btn sm primary", text: "Back to full screen", onclick: () => fullscreen(true) })));
    v.appendChild(h("div", { class: "exam-body" }, nav, main));
    nav.dataset.role = "nav";
    drawNav();
    show(ex.current || (items()[0] || {}).id);
    curAt = Date.now();
    startClock(); tick();
  }

  function isDone(it) {
    const ex = S.session.exam;
    if (it.kind === "mc") return ex.answers[it.id] != null;
    return (ex.codes[it.id] || "").trim() !== (it.p.starter || "").trim();
  }
  function drawNav() {
    const ex = S.session.exam, nav = document.querySelector(".exam-nav");
    if (!nav) return;
    nav.innerHTML = "";
    let mcN = 0, pN = 0;
    items().forEach((it) => {
      const label = it.kind === "mc" ? "Q" + (++mcN) : "P" + (++pN);
      nav.appendChild(h("button", { class: "exam-item" + (it.id === ex.current ? " on" : "") + (isDone(it) ? " done" : ""), title: it.kind === "mc" ? "Question" : it.p.name,
        onclick: () => show(it.id) }, h("b", { text: label }), h("span", { text: it.kind === "mc" ? (it.q.points + " pt") : it.p.points + " pts" })));
    });
    const done = items().filter(isDone).length;
    const c = $("examCount"); if (c) c.textContent = done + " / " + items().length + " answered";
  }

  function show(id) {
    const ex = S.session.exam, main = document.querySelector(".exam-main");
    if (!main) return;
    if (ed && ed.pid === ex.current) ex.codes[ed.pid] = ed.get();
    trackItem(); curAt = Date.now();
    ex.current = id;
    const list = items(), idx = list.findIndex((x) => x.id === id), it = list[idx];
    main.innerHTML = "";
    if (!it) return;
    const prev = idx > 0 ? h("button", { class: "btn ghost", html: "← Previous", onclick: () => show(list[idx - 1].id) }) : null;
    const next = idx < list.length - 1 ? h("button", { class: "btn", html: "Next →", onclick: () => show(list[idx + 1].id) }) : null;
    if (it.kind === "mc") {
      ed = null;
      const q = it.q;
      const opts = h("div", { class: "options" });
      q.options.forEach((o, i) => {
        const b = h("button", { class: ex.answers[q.id] === i ? "chosen picked" : "" }, h("span", { class: "key", text: String.fromCharCode(65 + i) }), h("span", { text: o }));
        b.onclick = () => { ex.answers[q.id] = i; [...opts.children].forEach((x, j) => x.className = j === i ? "chosen picked" : ""); drawNav(); ST().scheduleSave(); };
        opts.appendChild(b);
      });
      const card = h("div", { class: "tcard exam-q" }, h("div", { class: "kind", html: CC.icon("target") + " Question " + (idx + 1) + " · " + q.points + " pt" + (q.points === 1 ? "" : "s") }),
        MD.into(h("div", { class: "md" }), q.prompt), q.code ? MD.into(h("div", { class: "md" }), fence(q.code)) : null, opts);
      card.tabIndex = -1;
      card.addEventListener("keydown", (e) => { if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return; const i = e.key.toUpperCase().charCodeAt(0) - 65; if (i >= 0 && i < opts.children.length) opts.children[i].click(); });
      main.append(card, h("div", { class: "row" }, prev, h("span", { class: "spacer" }), next));
      setTimeout(() => card.focus(), 30);
    } else {
      const p = it.p;
      const host = h("div", { class: "editor", id: "examEditor" });
      const out = h("div", { class: "output hidden", id: "examOut" });
      const runB = h("button", { class: "btn primary", html: CC.icon("play") + " Run tests <span class='kbd'>⌘↵</span>" });
      const reset = h("button", { class: "btn ghost sm", title: "Back to the starting code", html: CC.icon("refresh") });
      main.append(h("div", { class: "statement md exam-statement" }), h("div", { class: "editor-wrap" }, host), out,
        h("div", { class: "row" }, runB, reset, h("span", { class: "spacer" }), prev, next));
      MD.into(main.querySelector(".exam-statement"), "**" + p.name + "** · " + p.points + " points\n\n" + p.statement);
      const run = () => runExam(p, runB);
      ed = CC.makeEditor(host, L(), { run, submit: run });
      ed.pid = p.id;
      ed.set(ex.codes[p.id] != null ? ex.codes[p.id] : p.starter);
      const mine = ed;
      mine.onChange(() => { ex.codes[p.id] = mine.get(); ST().scheduleSave(1500); drawNav(); });
      runB.onclick = run;
      reset.onclick = async () => { if (await CC.confirm("Reset code?", "Replace your code with the starting code?", "Reset")) { ed.set(p.starter); ex.codes[p.id] = p.starter; drawNav(); } };
      ed.refresh(); setTimeout(() => ed.focus(), 60);
    }
    drawNav();
    ST().scheduleSave();
  }

  async function runExam(p, btn) {
    const ex = S.session.exam;
    if (ed && ed.pid === p.id) ex.codes[p.id] = ed.get();
    ex.runs[p.id] = (ex.runs[p.id] || 0) + 1;
    btn.disabled = true;
    const o = $("examOut"); o.classList.remove("hidden");
    o.innerHTML = '<div class="out-head"><span class="dots"><span></span><span></span><span></span></span><span class="muted small">Running tests...</span></div>';
    const r = await CC.api("/api/run_tests", { language: L(), code: ex.codes[p.id], tests: p.tests });
    btn.disabled = false;
    o.innerHTML = "";
    if (r.error) { o.textContent = r.error; return; }
    if (r.stage === "compile") {
      o.append(h("div", { class: "out-head" }, h("span", { class: "chip bad", text: "Doesn't compile" })), h("div", { class: "out-body", text: r.message || "" }));
    } else {
      o.append(h("div", { class: "out-head" }, h("span", { class: "chip " + (r.ok ? "good" : "bad") + " progress-pill", text: r.passed + " / " + r.total + " tests pass" }),
        r.timed_out ? h("span", { class: "chip warn", text: "timed out" }) : null));
      if (!ex.spec.lockdown) o.appendChild(h("div", { class: "out-body", text: r.message || "" }));
    }
    ST().scheduleSave(0);
  }

  // ================================================================== grading
  let submitting = false;
  async function submit(auto, closedMsg) {
    const s = S.session, ex = s && s.exam;
    if (!ex || ex.phase !== "running" || submitting) return;
    submitting = true;
    try {
      if (ed && ed.pid === ex.current) ex.codes[ed.pid] = ed.get();
      trackItem(); away(false); stopClock(); curAt = null; liveId = null;
      ex.submittedAt = Math.min(Date.now(), ex.endsAt + 1000); ex.auto = !!auto; ex.closedWhenTimeRanOut = !!closedMsg;
      lockdown(false); fullscreen(false); ed = null;
      shell(h("div", { class: "card stack exam-card" }, h("h1", { text: auto ? "Time's up" : "Exam submitted" }),
        h("div", { class: "row" }, h("span", { class: "dots" }, h("span"), h("span"), h("span")), h("span", { id: "examStatus", class: "muted", text: "Grading on this computer..." }))));
      const res = [];
      let qn = 0, pn = 0;
      for (const it of items()) {
        if (it.kind === "mc") {
          const q = it.q, a = ex.answers[q.id];
          res.push({ id: q.id, label: "Q" + (++qn), kind: "mc", topic: q.topic, points: q.points, earned: a === q.correct ? q.points : 0, correct: a === q.correct, answer: a, ms: ex.timeOn[q.id] || 0 });
        } else {
          const p = it.p;
          setStatus("Running the tests for " + p.name + "...");
          let r = await CC.api("/api/run_tests", { language: L(), code: ex.codes[p.id] || "", tests: p.tests });
          if (r.error) r = await CC.api("/api/run_tests", { language: L(), code: ex.codes[p.id] || "", tests: p.tests });
          if (r.error) {        // couldn't run the tests at all (not the student's fault): left out of the score
            res.push({ id: p.id, label: "P" + (++pn), kind: "code", name: p.name, topic: p.topic, points: p.points, earned: 0, ungraded: r.error,
              passed: 0, total: p.total || 0, stage: "error", fails: [], compileError: "", runs: ex.runs[p.id] || 0, ms: ex.timeOn[p.id] || 0 });
            continue;
          }
          const passed = r.stage === "run" || r.ok ? (r.passed || 0) : 0, total = r.total || p.total || 0;
          const fails = String(r.message || "").split("\n").filter((l) => /^(FAIL|CRASH)/.test(l)).slice(0, 8);
          res.push({ id: p.id, label: "P" + (++pn), kind: "code", name: p.name, topic: p.topic, points: p.points, passed, total, stage: r.stage || "", fails,
            compileError: r.stage === "compile" ? String(r.message || "").slice(0, 1500) : "",
            earned: total ? Math.round(p.points * passed / total * 10) / 10 : 0, runs: ex.runs[p.id] || 0, ms: ex.timeOn[p.id] || 0 });
        }
      }
      const counted = res.filter((r) => !r.ungraded);
      const score = Math.round(counted.reduce((a, r) => a + r.earned, 0) * 10) / 10, total = counted.reduce((a, r) => a + r.points, 0);
      ex.results = { items: res, score, total, pct: total ? Math.round(100 * score / total) : 0, usedMs: ex.submittedAt - ex.startedAt,
        awayCount: ex.away.length, awayMs: ex.away.reduce((a, x) => a + x.ms, 0) };
      const md = reportMarkdown(s);
      const saved = await CC.api("/api/exam/save", { folder: s.course.folder, title: s.title, markdown: md });
      ex.report = saved.path || ""; ex.reportRel = saved.rel || "";
      CC.api("/api/outcome/log", { folder: s.course.folder, event: { type: "exam", title: s.title, pct: ex.results.pct, passed: score, total,
        topics: res.map((x) => ({ topic: x.topic, frac: x.points ? Math.round(100 * x.earned / x.points) / 100 : 0 })) } });
      ex.phase = "graded";
      s.display.push({ kind: "exam-report", pct: ex.results.pct, score, total, report: ex.report, rel: ex.reportRel, auto: ex.auto });
      await ST().saveNow();
      CC.sfx && CC.sfx.play(ex.results.pct >= 70 ? "levelup" : "toggle");
      ST().renderSession();
      ST().sendUser(debriefMessage(s), "Exam submitted · " + score + " / " + total + " (" + ex.results.pct + "%)");
    } finally {
      submitting = false;
    }
  }

  function reportMarkdown(s) {
    const ex = s.exam, r = ex.results;
    const when = new Date(ex.startedAt).toLocaleString();
    const lines = ["# " + s.title, "", "#codecoach #exam", "",
      when + " · " + s.course.name + " · " + ex.spec.minutes + " min · CodeCoach", "",
      "**Score: " + r.score + " / " + r.total + " (" + r.pct + "%)** · time used " + mins(r.usedMs) + " of " + ex.spec.minutes + "m" +
        (ex.auto ? (ex.closedWhenTimeRanOut ? " · time ran out while CodeCoach was closed" : " · submitted automatically at 0:00") : ""), "",
      "## Integrity log", "",
      "- Left the exam window: " + (r.awayCount ? r.awayCount + " time" + (r.awayCount > 1 ? "s" : "") + ", " + mins(r.awayMs) + " in total" : "never"),
      ex.spec.lockdown ? "- Left full screen: " + (ex.fsExits ? ex.fsExits + " time" + (ex.fsExits > 1 ? "s" : "") : "never") : "- Lockdown was off",
      ...ex.away.map((a) => "  - " + new Date(a.at).toLocaleTimeString() + " for " + mins(a.ms)), "",
      "## Results", "", "| # | Topic | Result | Points | Time on it |", "| --- | --- | --- | --- | --- |",
      ...r.items.map((x) => "| " + x.label + (x.name ? " `" + x.name + "`" : "") + " | " + (x.topic || "").replace(/\|/g, "\\|") + " | " +
        (x.kind === "mc" ? (x.answer == null ? "no answer" : x.correct ? "correct" : "wrong") : x.ungraded ? "not graded (" + String(x.ungraded).slice(0, 80).replace(/\|/g, "-") + ")" : x.stage === "compile" ? "doesn't compile" : x.passed + "/" + x.total + " tests") +
        " | " + x.earned + " / " + x.points + " | " + mins(x.ms) + " |"), ""];
    let qn = 0, pn = 0;
    items().forEach((it) => {
      const x = r.items.find((y) => y.id === it.id);
      if (it.kind === "mc") {
        const q = it.q;
        lines.push("## Q" + (++qn) + " · " + (q.topic || "") + " · " + (x.correct ? "correct" : "wrong"), "", q.prompt, "");
        if (q.code) lines.push(fence(q.code), "");
        q.options.forEach((o, i) => lines.push("- " + String.fromCharCode(65 + i) + ". " + o + (i === q.correct ? " **(correct)**" : "") + (i === x.answer ? " ← your answer" : "")));
        lines.push("", "> " + (q.explanation || "").split("\n").join("\n> "), "");
      } else {
        const p = it.p;
        lines.push("## P" + (++pn) + " · `" + p.name + "` · " + (p.topic || "") + " · " + (x.stage === "compile" ? "doesn't compile" : x.passed + "/" + x.total + " tests"), "", p.statement, "",
          "**Your code** (" + x.runs + " test run" + (x.runs === 1 ? "" : "s") + "):", "", fence(ex.codes[p.id] || ""), "");
        if (x.fails.length) lines.push("Failing tests:", "", ...x.fails.map((f) => "- `" + f.replace(/`/g, "'") + "`"), "");
        if (x.compileError) lines.push("Compiler:", "", "```", x.compileError, "```", "");
        lines.push("<details><summary>A model solution</summary>", "", fence(p.reference || ""), "", "</details>", "");
      }
    });
    return lines.join("\n");
  }

  function debriefMessage(s) {
    const ex = s.exam, r = ex.results;
    let qn = 0, pn = 0;
    const parts = items().map((it) => {
      const x = r.items.find((y) => y.id === it.id);
      if (it.kind === "mc") {
        const q = it.q;
        return "Q" + (++qn) + " (" + q.topic + "): " + (x.correct ? "correct" : "WRONG - I answered " + (x.answer == null ? "nothing" : JSON.stringify(q.options[x.answer])) + ", correct was " + JSON.stringify(q.options[q.correct])) +
          (x.correct ? "" : "\n" + q.prompt + (q.code ? "\n" + fence(q.code) : ""));
      }
      const p = it.p;
      if (x.ungraded) return "P" + (++pn) + " " + p.name + " (" + p.topic + "): not graded - the app couldn't run the tests (" + x.ungraded + ")";
      return "P" + (++pn) + " " + p.name + " (" + p.topic + "): " + (x.stage === "compile" ? "doesn't compile" : x.passed + "/" + x.total + " tests") + ", " + x.runs + " test runs, " + mins(x.ms) + " on it" +
        (x.passed < x.total || x.stage === "compile" ? "\nStatement:\n" + p.statement + "\nMy final code:\n" + fence(ex.codes[p.id] || "") + (x.fails.length ? "\nFailing tests:\n" + x.fails.join("\n") : "") + (x.compileError ? "\nCompiler:\n" + x.compileError : "") : "");
    });
    return "[EXAM RESULT] I took the practice exam \"" + s.title + "\" (" + ex.spec.minutes + " min, " + (ex.spec.lockdown ? "lockdown" : "no lockdown") + "). " +
      "Score " + r.score + "/" + r.total + " (" + r.pct + "%), time used " + mins(r.usedMs) + (ex.auto ? ", submitted automatically when time ran out" : "") + ". " +
      "Left the window " + r.awayCount + " time(s). The full report is saved at " + (ex.reportRel || "exams/") + ".\n\n" + parts.join("\n\n") +
      "\n\nDebrief me: start with the one or two misses that matter most, explain the idea behind each (don't just give answers), and ask me to fix my failing code myself before showing anything. " +
      "Then update_tracker for every topic on the exam with review_outcome (pass = full marks, hard = partial, fail = missed), log_mistake for real error patterns, and finish with what to practice next.";
  }

  function reportCard(it) {
    const d = h("div", { class: "tcard exam-report" }, h("div", { class: "kind", html: CC.icon("list") + " Exam result" }),
      h("div", { class: "row" }, h("b", { class: "exam-score", text: it.score + " / " + it.total }), h("span", { class: "chip " + (it.pct >= 70 ? "good" : it.pct >= 50 ? "warn" : "bad"), text: it.pct + "%" }),
        it.auto ? h("span", { class: "chip", text: "time ran out" }) : null, h("span", { class: "spacer" }),
        it.report ? h("button", { class: "btn sm", html: CC.icon("file") + " Open report", onclick: () => CC.api("/api/open", { path: it.report }) }) : null));
    if (it.rel) d.appendChild(h("div", { class: "tiny muted", text: "Saved to " + it.rel }));
    return d;
  }

  // reopening a session whose exam isn't finished
  function resume() {
    const ex = S.session.exam;
    if (ex.phase === "running" && Date.now() >= ex.endsAt) {
      return submit(true, true);
    }
    if (ex.phase === "running") {
      // full screen needs a click, so continue from a small screen
      shell(h("div", { class: "card stack exam-card" }, h("h1", { text: S.session.title }),
        h("p", { text: "Your exam is still running: " + mmss(ex.endsAt - Date.now()) + " left. The clock kept going while you were away." }),
        h("div", { class: "row" }, h("button", { class: "btn primary", html: CC.icon("play") + " Continue exam", onclick: () => { liveId = S.session.id; renderRunning(); if (ex.spec.lockdown) fullscreen(true); } }))));
      clearTimeout(endTo); endTo = setTimeout(() => { if (running() && !document.querySelector(".exam-body")) submit(true); }, Math.max(0, ex.endsAt - Date.now()) + 50);
      return;
    }
    render();
  }

  // the rest of the app stays out of reach while an exam is locked down
  const go = CC.go;
  CC.go = function (view, opts) {
    if (document.body.classList.contains("exam-lock") && view !== "study") { CC.toast("Submit the exam (or Leave it) first."); return; }
    return go.call(CC, view, opts);
  };

  CC.exam = { setupCard, start, render, resume, reportCard, _submit: submit };
})();
