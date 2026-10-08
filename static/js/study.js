/* CodeCoach study sessions: start screen, chat with the coach, tool cards, problem workspace. */
(function () {
  "use strict";
  const CC = window.CC, S = CC.S, h = CC.h, $ = CC.$;

  const MODES = {
    learn: { label: "Learn", icon: "book", desc: "New or shaky topic: teach, then the practice ladder" },
    drill: { label: "Drill", icon: "bolt", desc: "Lots of problems on topics you know" },
    quizsim: { label: "Quiz sim", icon: "timer", desc: "Timed practice test, no hints" },
    review: { label: "Review", icon: "refresh", desc: "Only what's due today (spaced review)" },
  };
  CC.MODES = MODES;
  const QUICK = ["Hint please", "Explain that differently", "Show me an example", "Give me another one", "Harder", "Easier", "Why does that work?"];

  // ================================================================== save
  let saveTimer = null;
  function scheduleSave(ms) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, ms == null ? 800 : ms); }
  let saveChain = Promise.resolve();
  function saveNow() {            // saves run one after another, so an older snapshot can never overwrite a newer one
    clearTimeout(saveTimer);
    const sess = S.session;
    if (!sess) return saveChain;
    saveChain = saveChain.then(async () => {
      const r = await CC.api("/api/session/save", sess);
      if (r.error) CC.toast("Couldn't save the session: " + r.error, true);
    }).catch(() => {});
    return saveChain;
  }
  CC.flushSave = function () {
    if (!S.session) return;
    pauseClocks(true);
    const s = S.session;
    // browsers cap "while closing" requests at 64 KB, so send only what changes second to second
    const body = JSON.stringify({ id: s.id, paused: s.paused, timer: s.timer || null,
      problems: s.problems.map((p) => ({ id: p.id, code: p.code, activeMs: p.activeMs, runningSince: p.runningSince, status: p.status, solvedIn: p.solvedIn, runs: p.runs, hints: p.hints })) });
    try {
      fetch("/api/session/patch", { method: "POST", keepalive: body.length < 60000, headers: { "X-CC-Token": window.CC_TOKEN, "Content-Type": "application/json" }, body }).catch(() => {});
    } catch (e) { /* best effort */ }
  };
  // leave the current session cleanly (save + stop clocks); refuses while the coach is mid-step
  async function leaveSession() {
    if (!S.session) return true;
    if (S.busy || S.pending) { CC.toast("Finish the current step first (or press Stop), then switch sessions.", true); return false; }
    pauseClocks(true);
    await saveNow();
    S.session = null; S.queue = [];
    CC.local.set("openSession", null);
    const b = $("studyBadge"); if (b) b.classList.add("hidden");
    return true;
  }

  // ================================================================== vault session note
  let noteQueue = Promise.resolve();
  function noteAppend(md) {
    if (!S.session || !S.session.note) return;
    const folder = S.session.course.folder, note = S.session.note;
    noteQueue = noteQueue.then(() => CC.api("/api/note/append_session", { folder, note, markdown: md })).catch(() => {});
  }
  const quote = (s) => String(s || "").split("\n").map((l) => "> " + l).join("\n");
  const L = () => (S.session ? S.session.course.language : (S.course ? S.course.language : "java"));
  const fenceLang = () => ({ cpp: "cpp", c: "c", python: "python", javascript: "javascript", java: "java", go: "go", rust: "rust" }[L()] || "");
  const fence = (code) => "```" + fenceLang() + "\n" + code + "\n```";

  // ================================================================== start screen
  const view = () => $("view-study");

  async function renderStart(opts) {
    opts = opts || {};
    const v = view();
    v.innerHTML = "";
    if (!S.course) {
      v.appendChild(h("div", { class: "page" }, h("div", { class: "page-inner" }, h("div", { class: "empty" },
        h("div", { html: CC.icon("book") }), h("h3", { text: "Create your first course or learning track" }),
        h("p", { text: "A class (organized from your class content) or a general track (e.g. \"Learn C++\") - CodeCoach sets up everything." }),
        h("button", { class: "btn primary", text: "New course or track", onclick: () => CC.views.newCourse() })))));
      return;
    }
    const c = S.course;
    let mode = opts.mode || "learn";
    const page = h("div", { class: "page" });
    const inner = h("div", { class: "page-inner" });
    page.appendChild(inner);
    v.appendChild(page);
    inner.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", { text: "Start a session" }),
      h("div", { class: "sub", text: c.name + " · " + CC.lang(c.language).label + (c.type === "general" ? " · general track" : " · class") }))));

    const left = h("div", { class: "stack" });
    const right = h("div", { class: "stack" });
    inner.appendChild(h("div", { class: "start" }, left, right));

    // modes
    const modes = h("div", { class: "modes" });
    Object.keys(MODES).forEach((k) => {
      const b = h("button", { class: "mode" + (k === mode ? " on" : ""), html: CC.icon(MODES[k].icon) + "<div><b>" + MODES[k].label + "</b><span>" + MODES[k].desc + "</span></div>" });
      b.onclick = () => { mode = k; modes.querySelectorAll(".mode").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
      modes.appendChild(b);
    });
    left.appendChild(h("div", { class: "card stack" }, h("div", { class: "label", text: "Session type" }), modes));

    // topic
    const topic = h("input", { type: "text", list: "topicSuggest", placeholder: "Optional - e.g. Maps, Week 6: Sets, recursion. Leave empty and the coach suggests one.", value: opts.topic || "" });
    const dl = h("datalist", { id: "topicSuggest" });
    const dash = await CC.api("/api/dashboard?" + CC.q({ folder: c.folder }));
    if (!dash.error) {
      if (dash.next) dl.appendChild(h("option", { value: dash.next }));
      (dash.topics || []).forEach((t) => dl.appendChild(h("option", { value: t.topic })));
    }
    const nextHint = dash && dash.next ? h("button", { class: "btn sm ghost", html: CC.icon("flag") + " Next on roadmap: " + CC.esc(dash.next), onclick: () => { topic.value = dash.next; } }) : null;
    left.appendChild(h("div", { class: "card stack" }, h("div", { class: "field" }, h("label", { text: "Topic" }), topic, dl), nextHint));

    // materials
    const mats = await CC.api("/api/materials?" + CC.q({ folder: c.folder }));
    const picked = new Set(opts.materials || []);
    const tree = h("div", { class: "pick-tree" });
    let count = 0;
    (mats.units || []).forEach((u) => {
      if (!u.items.length) return;
      tree.appendChild(h("div", { class: "unit", text: u.name || "Unsorted" }));
      u.items.forEach((it) => {
        count++;
        const cb = h("input", { type: "checkbox" });
        cb.checked = picked.has(it.path);
        cb.onchange = () => (cb.checked ? picked.add(it.path) : picked.delete(it.path));
        tree.appendChild(h("label", null, cb, h("span", { text: it.title }), h("span", { class: "chip", text: it.type }), h("span", { class: "tiny muted", text: Math.round(it.chars / 100) / 10 + "k" })));
      });
    });
    const matCard = h("div", { class: "card stack" }, h("div", { class: "row" }, h("div", { class: "label", text: "Study from your materials (optional)" }), h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost", html: CC.icon("folder") + " Manage", onclick: () => CC.go("materials") })));
    matCard.appendChild(count ? tree : h("div", { class: "hint", text: "No materials yet. Add lessons, slides, practice quizzes or quiz feedback in Materials, or paste something below." }));
    left.appendChild(matCard);

    // paste
    const paste = h("textarea", { rows: 4, placeholder: "Paste lesson text, a practice quiz with your answers, quiz feedback, an assignment prompt..." });
    const keep = h("input", { type: "checkbox", checked: true });
    const ptype = h("select", null, (S.state.material_types || []).map((t) => h("option", { value: t, text: t })));
    ptype.value = "lesson";
    left.appendChild(h("div", { class: "card stack" }, h("div", { class: "field" }, h("label", { text: "Or paste something" }), paste),
      h("div", { class: "row small" }, h("label", { class: "row" }, keep, h("span", { text: "Save it to Materials as" })), ptype)));

    const startBtn = h("button", { class: "btn primary", html: CC.icon("play") + " Start session" });
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      const paths = Array.from(picked);
      let pasted = paste.value.trim();
      if (pasted && keep.checked) {
        const r = await CC.api("/api/materials/save", { folder: c.folder, unit: "Pasted", title: (topic.value.trim() || MODES[mode].label) + " - " + CC.today(), type: ptype.value, content: pasted });
        if (!r.error) { paths.push(r.path); pasted = ""; }
      }
      await startSession(mode, topic.value.trim(), paths, pasted);
    };
    left.appendChild(h("div", { class: "row end" }, h("span", { class: "hint", html: "Tip: <kbd>⌘</kbd><kbd>Enter</kbd> runs code, <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd> submits" }), h("span", { class: "spacer" }), startBtn));

    // resume
    const list = h("div", { class: "list" });
    right.appendChild(h("div", { class: "card" }, h("h3", { html: CC.icon("refresh") + " Resume" }), list));
    const rs = await CC.api("/api/sessions?" + CC.q({ folder: c.folder }));
    const sessions = rs.sessions || [];
    if (!sessions.length) list.appendChild(h("div", { class: "hint", text: "Your sessions will show up here. Everything saves automatically." }));
    sessions.slice(0, 14).forEach((s) => {
      const row = h("div", { class: "sess-row", onclick: () => resumeSession(s.id) },
        h("div", { class: "t" }, h("b", { text: s.title || "Session" }),
          h("span", { class: "tiny muted", text: (MODES[s.mode] ? MODES[s.mode].label : s.mode) + " · " + CC.fmtTime(s.updated) + (s.problems ? " · " + s.solved + "/" + s.problems + " solved" : "") })),
        h("div", { class: "acts" },
          h("button", { class: "btn icon ghost sm", title: "Rename", html: CC.icon("edit"), onclick: async (e) => {
            e.stopPropagation();
            const t = await CC.prompt("Rename session", "Title", s.title);
            if (t) { await CC.api("/api/session/rename", { id: s.id, title: t }); renderStart(); }
          } }),
          h("button", { class: "btn icon ghost sm", title: "Delete", html: CC.icon("trash"), onclick: async (e) => {
            e.stopPropagation();
            if (await CC.confirm("Delete session?", "\"" + (s.title || "Session") + "\" will be moved to CodeCoach's trash folder. Your notes and progress stay.", "Delete", true)) {
              await CC.api("/api/session/delete", { id: s.id }); renderStart();
            }
          } })));
      list.appendChild(row);
    });
  }

  // ================================================================== session view
  let chat, editor;
  let splitCleanup = null;
  const sessionShown = () => chat && document.body.contains(chat) && S.session && chat.dataset.sid === S.session.id;
  function renderSession() {
    const v = view();
    v.innerHTML = "";
    const s = S.session;
    CC.local.set("openSession", s.id);      // a reload (or macOS restarting the page) reopens this session
    const title = h("div", { class: "title", text: s.title, title: "Click to rename" });
    title.onclick = async () => {
      const t = await CC.prompt("Rename session", "Title", s.title);
      if (t) { s.title = t; title.textContent = t; scheduleSave(0); }
    };
    const timer = h("div", { class: "timer hidden", id: "timerBadge", title: "Countdown set by your coach (quiz sims / timed problems)" });
    const pauseBtn = h("button", { class: "btn sm ghost", id: "pauseBtn", title: "Pause the timers while you step away" });
    const cost = h("span", { class: "chip", id: "costChip" });
    const wsToggle = h("button", { class: "btn icon ghost", title: "Show/hide workspace", html: CC.icon("panel") });
    const endBtn = h("button", { class: "btn sm", html: CC.icon("flag") + " End session", title: "Get the end-of-session summary" });
    const closeBtn = h("button", { class: "btn sm ghost", html: CC.icon("x") + " Close", title: "Leave this session (it stays saved)" });
    v.appendChild(h("div", { class: "sess-bar" }, title, h("span", { class: "chip accent", text: MODES[s.mode] ? MODES[s.mode].label : s.mode }),
      h("span", { class: "chip", text: s.course.name }), h("span", { class: "spacer" }), timer, pauseBtn, cost, wsToggle, endBtn, closeBtn));
    v.appendChild(h("div", { class: "pause-banner hidden", id: "pauseBanner" }, h("span", { html: CC.icon("pause") }),
      h("span", { id: "pauseText", text: "Paused - timers are stopped." }), h("span", { class: "spacer" }),
      h("button", { class: "btn sm primary", html: CC.icon("play") + "<span>Resume</span>", onclick: () => { resumeClocks(); CC.sfx && CC.sfx.play("toggle"); } })));

    chat = h("div", { class: "chat", id: "chat", "data-sid": s.id });
    const input = h("textarea", { id: "input", rows: 1, placeholder: "Message " + CC.coachName() + "...   Enter to send · Shift+Enter for a new line" });
    const sendBtn = h("button", { class: "btn primary icon", title: "Send", html: CC.icon("send") });
    const stopBtn = h("button", { class: "btn sm hidden", id: "stopBtn", html: CC.icon("stop") + " Stop" });
    const quick = h("div", { class: "quick-replies" }, QUICK.map((q) => h("button", { text: q, onclick: () => sendUser(q) })));
    const composer = h("div", { class: "composer" }, quick, h("div", { class: "composer-box" }, input, h("div", { class: "composer-acts" },
      h("span", { class: "hint", id: "composerHint" }), h("span", { class: "spacer" }), stopBtn, sendBtn)));
    const chatcol = h("div", { class: "chatcol" }, chat, composer);

    // workspace
    const tabs = h("div", { class: "ws-tabs", id: "wsTabs" });
    const statement = h("div", { class: "statement md", id: "pStatement" });
    const edHost = h("div", { class: "editor", id: "pEditor" });
    const out = h("div", { class: "output hidden", id: "pOutput" });
    const runBtn = h("button", { class: "btn primary", id: "runBtn", html: CC.icon("play") + " Run tests <span class='kbd'>⌘↵</span>" });
    const submitBtn = h("button", { class: "btn", id: "submitBtn", html: CC.icon("check") + " Submit <span class='kbd'>⌘⇧↵</span>" });
    const stuckBtn = h("button", { class: "btn ghost", id: "stuckBtn", html: CC.icon("bulb") + " I'm stuck" });
    const giveBtn = h("button", { class: "btn ghost", id: "giveupBtn", text: "Give up" });
    const resetBtn = h("button", { class: "btn ghost sm", title: "Reset to the starting code", html: CC.icon("refresh") });
    const wsEmpty = h("div", { class: "empty", id: "wsEmpty" }, h("div", { html: CC.icon("code") }), h("h3", { text: "Your workspace" }),
      h("p", { text: "Coding problems from your coach open here. Write your answer, Run tests as often as you like, then Submit." }));
    const wsMain = h("div", { class: "ws-body hidden", id: "wsMain" },
      statement, h("div", { class: "editor-wrap" }, edHost), out);
    const workcol = h("div", { class: "workcol" },
      h("div", { class: "ws-head" }, tabs, h("span", { class: "chip", id: "pClock" })),
      wsEmpty, wsMain,
      h("div", { class: "ws-actions hidden", id: "wsActions" }, runBtn, submitBtn, stuckBtn, giveBtn, h("span", { class: "spacer" }), resetBtn));
    const splitter = h("div", { class: "splitter" });
    const split = h("div", { class: "split" + (CC.local.get("wsHidden", false) ? " nowork" : "") }, chatcol, splitter, workcol);
    v.appendChild(split);

    if (editor) CC.editors = CC.editors.filter((x) => x !== editor);   // the old session's editor is gone
    editor = CC.makeEditor(edHost, s.course.language, { run: runCurrent, submit: submitCurrent });
    if (editor.cm) editor.cm.on("change", (c, ch) => { if (ch.origin !== "setValue" && S.session && S.session.paused) resumeClocks(); });
    else editor.onChange(() => { if (S.session && S.session.paused) resumeClocks(); });
    editor.onChange(() => { const p = curProblem(); if (p && p.status === "open") { p.code = editor.get(); scheduleSave(1500); } });

    // wiring
    const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(240, input.scrollHeight) + "px"; };
    const draftKey = "draft_" + s.id;
    input.value = CC.local.get(draftKey, "") || "";
    setTimeout(autosize, 0);
    input.addEventListener("input", () => { autosize(); CC.local.set(draftKey, input.value); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendBtn.click(); } });
    sendBtn.onclick = () => { const t = input.value.trim(); if (!t) return; if (S.busy && !S.pending) { CC.toast(CC.coachName() + " is still working - your message is kept. Send it when the reply finishes, or press Stop."); return; } input.value = ""; CC.local.set(draftKey, null); autosize(); sendUser(t); };
    stopBtn.onclick = () => {
      if (S.pending) {
        S.stopReq = true;
        document.querySelectorAll(".tcard.live").forEach((c) => { c.classList.remove("live"); c.querySelectorAll("button,input,textarea").forEach((x) => (x.disabled = true)); });
        S.pending.resolve({ skipped: true, note: "The student pressed Stop. Don't continue; wait for their next message." });
      } else if (S.abort) S.abort.abort();
    };
    endBtn.onclick = () => { if (S.busy) return; sendUser("Let's stop here. Please give me the end-of-session summary and update my notes."); pauseClocks(false, "Session ended - timers are paused until you continue."); };
    pauseBtn.onclick = () => { if (S.session.paused) { resumeClocks(); CC.sfx && CC.sfx.play("toggle"); } else pauseClocks(false); };
    closeBtn.onclick = async () => { if (await leaveSession()) renderStart(); };
    wsToggle.onclick = () => { split.classList.toggle("nowork"); CC.local.set("wsHidden", split.classList.contains("nowork")); editor.refresh(); };
    runBtn.onclick = runCurrent; submitBtn.onclick = submitCurrent; stuckBtn.onclick = stuckCurrent; giveBtn.onclick = giveUpCurrent;
    resetBtn.onclick = async () => { const p = curProblem(); if (p && await CC.confirm("Reset code?", "Replace your code with the starting code?", "Reset")) { editor.set(p.starter); p.code = p.starter; scheduleSave(); } };
    let drag = false;
    splitter.addEventListener("mousedown", (e) => { drag = true; e.preventDefault(); document.body.style.cursor = "col-resize"; });
    const onUp = () => { if (drag) { drag = false; document.body.style.cursor = ""; editor.refresh(); CC.local.set("split", chatcol.style.flex); } };
    const onMove = (e) => {
      if (!drag) return;
      const rect = split.getBoundingClientRect();
      const pct = Math.min(72, Math.max(28, ((e.clientX - rect.left) / rect.width) * 100));
      chatcol.style.flex = "0 0 " + pct + "%";
    };
    if (splitCleanup) splitCleanup();
    window.addEventListener("mouseup", onUp); window.addEventListener("mousemove", onMove);
    splitCleanup = () => { window.removeEventListener("mouseup", onUp); window.removeEventListener("mousemove", onMove); };
    const savedSplit = CC.local.get("split", null);
    if (savedSplit) chatcol.style.flex = savedSplit;

    s.display.forEach((it) => { const n = renderItem(it); if (n) chat.appendChild(n); });
    renderProblemTabs();
    const open = s.problems.filter((p) => p.status === "open");
    if (s.problems.length) selectProblem((open[open.length - 1] || s.problems[s.problems.length - 1]).id);
    if (s.timer && !s.timer.fired) startTimerLoop();
    updatePauseUI();
    updateCost();
    scrollChat(true);
    $("studyBadge").classList.remove("hidden");
    setTimeout(() => input.focus(), 50);
  }

  function scrollChat(force) {
    if (!chat) return;
    const near = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 260;
    if (force || near) chat.scrollTop = chat.scrollHeight;
  }

  function updateCost() {
    const c = $("costChip");
    if (c && S.session) c.textContent = "$" + (S.session.usage.cost || 0).toFixed(3) + " · " + Math.round((S.session.usage.tokens || 0) / 1000) + "k tok";
  }

  // ================================================================== chat items
  function addItem(item, opts) {
    opts = opts || {};
    if (S.session && opts.save !== false) S.session.display.push(item);
    if (opts.render !== false && chat) { const n = renderItem(item); if (n) chat.appendChild(n); scrollChat(); }
  }

  function renderItem(it) {
    switch (it.kind) {
      case "you": return h("div", { class: "msg you", text: it.text });
      case "coach": return h("div", { class: "msg coach" }, h("div", { class: "avatar", html: CC.coachAvatar() }), h("div", { class: "body" }, h("div", { class: "who", text: CC.coachName() }), MD.into(h("div", { class: "md" }), it.text)));
      case "sys": return h("div", { class: "msg sys", html: CC.icon(it.icon || "check") + "<span>" + CC.esc(it.text) + "</span>" });
      case "err": {
        const d = h("div", { class: "msg err" }, h("span", { text: it.text }));
        if (it.retry) d.appendChild(h("button", { class: "btn sm", text: "Retry", onclick: () => { d.remove(); runAgent(); } }));
        return d;
      }
      case "quiz": return quizCard(it, null);
      case "ask": return askCard(it, null);
      case "drill": return drillCard(it, null);
      case "parsons": return parsonsCard(it, null);
      case "problem": return h("div", { class: "tcard" }, h("div", { class: "kind", html: CC.icon("code") + " Problem · R" + CC.esc(it.rung) }),
        h("div", { class: "row" }, h("b", { class: "mono", text: it.name }), h("span", { class: "chip", text: it.topic || "" }), h("span", { class: "spacer" }),
          h("button", { class: "btn sm", html: CC.icon("arrow") + " Open", onclick: () => { showWorkspace(); selectProblem(it.id); } })));
    }
    return null;
  }

  function setThinking(on, label) {
    let t = $("thinkingRow");
    if (on && !t && chat) {
      t = h("div", { class: "thinking", id: "thinkingRow", html: '<span class="dots"><span></span><span></span><span></span></span><span>' + (label || CC.esc(CC.coachName()) + " is thinking") + "</span>" });
      chat.appendChild(t); scrollChat();
    }
    if (!on && t) t.remove();
    const sb = $("stopBtn"); if (sb) sb.classList.toggle("hidden", !S.busy);
    updateProblemButtons();
  }

  // ================================================================== cards
  function quizCard(it, resolve) {
    const d = h("div", { class: "tcard" + (resolve ? " live" : "") }, h("div", { class: "kind", html: CC.icon("target") + (it.sim ? " Question" : " Quiz") }));
    d.appendChild(MD.into(h("div", { class: "md" }), it.question));
    if (it.code) d.appendChild(MD.into(h("div", { class: "md" }), "```" + fenceLang() + "\n" + it.code + "\n```"));
    const opts = h("div", { class: "options" });
    const verdict = h("div", { class: "verdict hidden" });
    const expl = h("div", { class: "explain md hidden" });
    const show = (chosen) => {
      d.classList.remove("live");
      opts.classList.add("done");
      [...opts.children].forEach((b, i) => {
        b.disabled = true;
        if (i === it.correct_index && !it.sim) { b.classList.add("right"); b.appendChild(h("span", { class: "opt-mark", html: CC.icon("check") })); }
        else if (i === chosen) { b.classList.add(it.sim ? "picked" : "wrong"); b.appendChild(h("span", { class: "opt-mark", html: CC.icon(it.sim ? "check" : "x") })); }
        if (i === chosen) b.classList.add("chosen");
      });
      const ok = chosen === it.correct_index;
      verdict.className = "verdict " + (it.sim ? "neutral" : ok ? "good" : "bad");
      verdict.innerHTML = it.sim ? '<span class="vd-ic">' + CC.icon("check") + "</span>Answer recorded" : ok ? '<span class="vd-ic">' + CC.icon("check") + "</span>Correct" : '<span class="vd-ic">' + CC.icon("x") + "</span>Not quite";
      if (it.explanation && !it.sim) MD.into(expl, it.explanation) && expl.classList.remove("hidden");
    };
    (it.options || []).forEach((o, i) => {
      const b = h("button", null, h("span", { class: "key", text: String.fromCharCode(65 + i) }), h("span", { text: o }));
      b.onclick = () => { if (!resolve) return; it.chosen = i; show(i); if (!it.sim) { CC.sfx && CC.sfx.play(i === it.correct_index ? "good" : "bad"); if (i === it.correct_index) CC.celebrate && CC.celebrate(b); } resolve({ chosen_index: i, chosen_text: o, correct: i === it.correct_index }); };
      opts.appendChild(b);
    });
    d.append(opts, verdict, expl);
    if (it.chosen !== undefined && !resolve) show(it.chosen);
    if (resolve) d.tabIndex = -1, d.addEventListener("keydown", (e) => { if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return; const i = e.key.toUpperCase().charCodeAt(0) - 65; if (i >= 0 && i < opts.children.length && !e.metaKey) opts.children[i].click(); });
    return d;
  }

  function markAsk(opts, ans) {
    opts.classList.add("done");
    [...opts.children].forEach((b) => { if (b.textContent.trim() === String(ans).trim()) b.classList.add("picked"); });
  }
  function askCard(it, resolve) {
    const d = h("div", { class: "tcard" + (resolve ? " live" : "") }, h("div", { class: "kind", html: CC.icon("help") + " Question" }));
    d.appendChild(MD.into(h("div", { class: "md" }), it.question));
    const opts = h("div", { class: "options" });
    const done = (ans) => {
      if (!resolve) return;
      it.answer = ans; d.classList.remove("live");
      d.querySelectorAll("button,input").forEach((x) => (x.disabled = true));
      markAsk(opts, ans);
      d.appendChild(h("div", { class: "verdict neutral", html: '<span class="vd-ic">' + CC.icon("check") + "</span>" + CC.esc(ans) }));
      resolve({ answer: ans });
    };
    (it.choices || []).forEach((c) => opts.appendChild(h("button", { onclick: () => done(c) }, h("span", { text: c }))));
    d.appendChild(opts);
    if (it.allow_free_text !== false) {
      const inp = h("input", { type: "text", placeholder: "Or type your own answer..." });
      const b = h("button", { class: "btn", text: "Send", onclick: () => inp.value.trim() && done(inp.value.trim()) });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") b.click(); });
      d.appendChild(h("div", { class: "inline-row" }, inp, b));
    }
    if (it.answer !== undefined && !resolve) { d.querySelectorAll("button,input").forEach((x) => (x.disabled = true)); markAsk(opts, it.answer); d.appendChild(h("div", { class: "verdict neutral", html: '<span class="vd-ic">' + CC.icon("check") + "</span>" + CC.esc(it.answer) })); }
    return d;
  }

  const normOut = (s) => String(s || "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).join("\n").trim();
  async function runDrillAnswer(harness, answer) {
    let res = await CC.api("/api/run_snippet", { language: L(), code: harness.split("{{ANSWER}}").join(answer) });
    if (res.compile_error && /;\s*$/.test(answer)) {
      const r2 = await CC.api("/api/run_snippet", { language: L(), code: harness.split("{{ANSWER}}").join(answer.replace(/;\s*$/, "")) });
      if (!r2.compile_error) res = r2;
    }
    return res;
  }

  function drillCard(it, resolve) {
    const d = h("div", { class: "tcard" + (resolve ? " live" : "") }, h("div", { class: "kind", html: CC.icon("bolt") + " Drill · write one line from memory" }));
    d.appendChild(MD.into(h("div", { class: "md" }), it.prompt));
    const inp = h("textarea", { rows: 1, placeholder: "Type the code, then Enter", spellcheck: "false" });
    const b = h("button", { class: "btn primary", text: "Check" });
    const reveal = h("button", { class: "btn ghost hidden", text: "Show answer" });
    const fb = h("div", { class: "small", style: { marginTop: "6px" } });
    d.append(h("div", { class: "inline-row" }, inp, b, reveal), fb);
    it.answers = it.answers || [];
    const finish = (correct, revealed) => {
      it.correct = correct; it.revealed = revealed; d.classList.remove("live");
      inp.disabled = b.disabled = reveal.disabled = true;
      fb.innerHTML = "";
      d.appendChild(h("div", { class: "verdict " + (correct ? "good" : "bad"), html: '<span class="vd-ic">' + CC.icon(correct ? "check" : "x") + "</span>" + (correct ? "Correct" : "Answer") +
        (it.reference_answer ? ' <span class="vd-ref">' + (correct ? "standard form " : "") + "<code>" + CC.esc(it.reference_answer) + "</code></span>" : "") }));
      if (resolve) { CC.sfx && CC.sfx.play(correct ? "good" : "bad"); if (correct) CC.celebrate && CC.celebrate(d.lastChild); resolve({ correct, attempts: it.answers.length, answers: it.answers, revealed_answer: revealed }); }
    };
    const check = async () => {
      const ans = inp.value.trim();
      if (!ans || !resolve) return;
      b.disabled = true; fb.textContent = "Checking...";
      const res = await runDrillAnswer(it.harness, ans);
      b.disabled = false;
      it.answers.push(ans);
      if (!res.compile_error && normOut(res.stdout) === normOut(it.expected_output)) return finish(true, false);
      fb.innerHTML = res.compile_error ? '<span style="color:var(--bad)">Doesn\'t compile:</span> <code>' + CC.esc((res.stderr || "").split("\n")[0]) + "</code>"
        : '<span style="color:var(--bad)">Not quite.</span> It printed <code>' + CC.esc(normOut(res.stdout) || res.stderr || "(nothing)") + "</code>";
      if (it.answers.length >= 2) reveal.classList.remove("hidden");
      if (it.answers.length >= 3) finish(false, true);
      inp.select();
    };
    b.onclick = check;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } });
    reveal.onclick = () => finish(false, true);
    if (it.correct !== undefined && !resolve) { inp.value = it.answers[it.answers.length - 1] || ""; finish(it.correct, it.revealed); }
    if (resolve) setTimeout(() => inp.focus(), 60);
    return d;
  }

  // Parsons problem: click blocks to move them into "your solution", reorder with the arrows, then Check.
  function parsonsCard(it, resolve) {
    const d = h("div", { class: "tcard parsons" + (resolve ? " live" : "") }, h("div", { class: "kind", html: CC.icon("list") + " Put the lines in order" }));
    d.appendChild(MD.into(h("div", { class: "md" }), it.prompt));
    const strip = (x) => String(x).replace(/\s+$/, "");
    const all = it.lines.map((t, i) => ({ t: strip(t), ok: i })).concat((it.distractors || []).map((t) => ({ t: strip(t), ok: -1 })));
    if (!it.order) { it.order = all.map((_, i) => i); for (let i = it.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [it.order[i], it.order[j]] = [it.order[j], it.order[i]]; } }
    it.used = it.used || [];
    it.attempts = it.attempts || 0;
    const pool = h("div", { class: "pz-pool" }), sol = h("div", { class: "pz-sol" }), fb = h("div", { class: "small", style: { marginTop: "6px" } });
    const check = h("button", { class: "btn primary", text: "Check" });
    const reveal = h("button", { class: "btn ghost hidden", text: "Show answer" });
    const done = () => it.correct !== undefined;
    // Blocks pool -> click (or drag) to add. Solution -> drag or ↑↓ to reorder, × (or drag back up) to return a block.
    // Clicking a solution block itself does nothing, so lines can't be removed by accident.
    let drag = null;                       // { i, pos } pos = index in it.used, or -1 when dragged from the pool
    const live = () => resolve && !done() && d.classList.contains("live");
    const move = (from, to) => { const [x] = it.used.splice(from, 1); it.used.splice(to, 0, x); fb.textContent = ""; draw(); };
    const clearMarks = () => sol.querySelectorAll(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
    const block = (i, inSol, pos) => {
      const b = h("div", { class: "pz-block" + (inSol ? " in" : " add"), title: inSol ? "Drag or use the arrows to reorder" : "Click or drag down to add" });
      if (inSol) b.appendChild(h("span", { class: "pz-grip", html: "&#8942;&#8942;" }));
      else b.appendChild(h("span", { class: "pz-plus", text: "+" }));
      b.appendChild(h("code", { text: all[i].t.trim() }));
      if (live()) {
        b.draggable = true;
        b.addEventListener("dragstart", (e) => { drag = { i, pos: inSol ? pos : -1 }; b.classList.add("dragging"); d.classList.add("pz-dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "pz"); } catch (er) {} });
        b.addEventListener("dragend", () => { drag = null; b.classList.remove("dragging"); d.classList.remove("pz-dragging"); clearMarks(); pool.classList.remove("drop-here"); });
      }
      if (inSol) {
        const indent = (all[i].t.match(/^\s*/) || [""])[0].replace(/\t/g, "    ").length;
        b.style.marginLeft = Math.min(indent, 24) * 6 + "px";
        const up = h("button", { class: "btn ghost icon sm", html: "&#8593;", title: "Move up", onclick: (e) => { e.stopPropagation(); if (pos > 0) move(pos, pos - 1); } });
        const dn = h("button", { class: "btn ghost icon sm", html: "&#8595;", title: "Move down", onclick: (e) => { e.stopPropagation(); if (pos < it.used.length - 1) move(pos, pos + 1); } });
        const back = h("button", { class: "btn ghost icon sm pz-back", html: "&times;", title: "Send back to Blocks (not used)", onclick: (e) => { e.stopPropagation(); it.used.splice(pos, 1); fb.textContent = ""; draw(); } });
        up.disabled = !live() || pos === 0; dn.disabled = !live() || pos === it.used.length - 1; back.disabled = !live();
        b.append(h("span", { class: "spacer" }), up, dn, back);
        if (live()) {
          b.addEventListener("dragover", (e) => {
            if (!drag) return; e.preventDefault(); e.stopPropagation();
            const r = b.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
            clearMarks(); b.classList.add(after ? "drop-after" : "drop-before");
          });
          b.addEventListener("drop", (e) => {
            if (!drag) return; e.preventDefault(); e.stopPropagation(); d.classList.remove("pz-dragging"); setTimeout(() => (drag = null), 0);
            const r = b.getBoundingClientRect(); let to = pos + (e.clientY > r.top + r.height / 2 ? 1 : 0);
            if (drag.pos >= 0) { if (drag.pos < to) to--; move(drag.pos, to); }
            else { it.used.splice(to, 0, drag.i); fb.textContent = ""; draw(); }
          });
        }
      } else b.onclick = () => { if (!live()) return; it.used.push(i); fb.textContent = ""; draw(); };
      return b;
    };
    // dropping on empty space in the solution appends; dropping on the Blocks area returns the block
    sol.addEventListener("dragover", (e) => { if (drag && live()) e.preventDefault(); });
    sol.addEventListener("drop", (e) => { if (!drag || !live()) return; e.preventDefault(); if (drag.pos >= 0) move(drag.pos, it.used.length - 1); else { it.used.push(drag.i); fb.textContent = ""; draw(); } });
    pool.addEventListener("dragover", (e) => { if (drag && drag.pos >= 0 && live()) { e.preventDefault(); pool.classList.add("drop-here"); } });
    pool.addEventListener("dragleave", () => pool.classList.remove("drop-here"));
    pool.addEventListener("drop", (e) => { pool.classList.remove("drop-here"); if (!drag || drag.pos < 0 || !live()) return; e.preventDefault(); it.used.splice(drag.pos, 1); fb.textContent = ""; draw(); });
    // identical-looking lines (like two "}") are interchangeable: keep them in their original order by position
    const canon = () => {
      const groups = {};
      it.used.forEach((i, pos) => { const k = all[i].t.trim(); (groups[k] = groups[k] || []).push(pos); });
      Object.values(groups).forEach((ps) => { if (ps.length < 2) return; const ids = ps.map((q) => it.used[q]).sort((x, y) => (all[x].ok < 0) - (all[y].ok < 0) || x - y); ps.forEach((q, k) => (it.used[q] = ids[k])); });
    };
    const draw = () => {
      if (live()) canon();
      pool.innerHTML = ""; sol.innerHTML = "";
      it.order.filter((i) => !it.used.includes(i)).forEach((i) => pool.appendChild(block(i, false)));
      if (!pool.children.length) pool.appendChild(h("div", { class: "hint", text: done() ? "" : "All blocks used - press × on a line to send it back here" }));
      it.used.forEach((i, pos) => sol.appendChild(block(i, true, pos)));
      if (!it.used.length) sol.appendChild(h("div", { class: "hint", text: "Click blocks above (or drag them here) to build the code" }));
    };
    const finish = (correct, revealed) => {
      it.correct = correct; it.revealed = revealed; d.classList.remove("live");
      check.disabled = reveal.disabled = true;
      if (revealed) it.used = it.lines.map((_, i) => i);
      draw();
      d.appendChild(h("div", { class: "verdict " + (correct ? "good" : "bad"), html: '<span class="vd-ic">' + CC.icon(correct ? "check" : "x") + "</span>" + (correct ? "Correct order" : "Here's the right order") + (it.attempts > 1 && correct ? ' <span class="vd-ref">' + it.attempts + " checks</span>" : "") }));
      if (resolve) { CC.sfx && CC.sfx.play(correct ? "good" : "bad"); if (correct) CC.celebrate && CC.celebrate(d.lastChild); resolve({ correct, attempts: it.attempts, revealed }); }
    };
    check.onclick = () => {
      if (!resolve || done()) return;
      it.attempts++;
      const want = it.lines.map((_, i) => i);
      const got = it.used.map((i) => (all[i].ok >= 0 || !it.lines.some((l) => strip(l).trim() === all[i].t.trim()) ? all[i].ok : it.lines.findIndex((l) => strip(l).trim() === all[i].t.trim())));
      let firstWrong = got.findIndex((v, k) => v !== want[k]);
      if (firstWrong < 0 && got.length === want.length) return finish(true, false);
      if (firstWrong < 0) firstWrong = got.length;
      const extra = got.includes(-1);
      CC.sfx && CC.sfx.play("fail");
      fb.innerHTML = '<span style="color:var(--bad)">Not yet.</span> ' + (firstWrong > 0 ? "The first " + firstWrong + " line" + (firstWrong > 1 ? "s are" : " is") + " right. " : "") +
        (extra ? "One of your lines doesn't belong. " : "") + (got.length < want.length ? "Some lines are still missing." : "");
      [...sol.children].forEach((b, k) => b.classList.toggle("bad", k === firstWrong));
      if (it.attempts >= 2) reveal.classList.remove("hidden");
      scheduleSave();
    };
    reveal.onclick = () => finish(false, true);
    d.append(h("div", { class: "pz-label" }, "Blocks", h("span", { text: " · not every block is needed · click to add" })), pool,
      h("div", { class: "pz-label" }, "Your solution", h("span", { text: " · drag or ↑↓ to reorder · × sends a line back" })), sol, h("div", { class: "inline-row" }, check, reveal), fb);
    draw();
    if (done() && !resolve) finish(it.correct, it.revealed);
    return d;
  }

  function waitFor(card) {
    return new Promise((res) => {
      S.pending = { resolve: (v) => { S.pending = null; res(v); } };
      chat.appendChild(card); scrollChat(true);
      $("composerHint").textContent = "Answer the card above - or type here to ask a question instead.";
    });
  }
  function clearHint() { const n = $("composerHint"); if (n) n.textContent = ""; }

  // ================================================================== tools offered to the model
  const TOOLS = [
    { type: "function", function: { name: "quiz", description: "Ask a question with one right answer (multiple choice). Probes, quiz-checks, R1 traces, pattern recognition, quiz-sim multiple choice. For code-output questions, run_code first and use the real output.",
      parameters: { type: "object", properties: { question: { type: "string", description: "Markdown" }, code: { type: "string", description: "Optional snippet shown with syntax highlighting" },
        options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 }, correct_index: { type: "integer" }, explanation: { type: "string", description: "Shown after answering (markdown). Leave empty in quiz sims." } },
        required: ["question", "options", "correct_index"] } } },
    { type: "function", function: { name: "ask", description: "Question with no right answer (goals, preferences, what next). Choice buttons plus free text.",
      parameters: { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" } }, allow_free_text: { type: "boolean" } }, required: ["question"] } } },
    { type: "function", function: { name: "run_code", description: "Run a snippet yourself (the student doesn't see it) to verify outputs or behavior. Java/C/C++: statements run inside main, or a full program. Python/JS: a script.",
      parameters: { type: "object", properties: { code: { type: "string" }, language: { type: "string", description: "Defaults to the course language" }, stdin: { type: "string" } }, required: ["code"] } } },
    { type: "function", function: { name: "drill", description: "R0 toolkit drill: the student types ONE expression/statement from memory. Harness contains {{ANSWER}} once and prints output that depends on it; your reference answer is verified first.",
      parameters: { type: "object", properties: { prompt: { type: "string" }, harness: { type: "string" }, expected_output: { type: "string" }, reference_answer: { type: "string" },
        toolkit_task: { type: "string" } }, required: ["prompt", "harness", "expected_output", "reference_answer"] } } },
    { type: "function", function: { name: "give_problem", description: "Give an R2-R6 coding problem in the student's editor. Reference is tested first; rejected if it fails or if the starter already passes. After success, STOP and wait for the result message.",
      parameters: { type: "object", properties: { name: { type: "string" }, topic: { type: "string", description: "Tracker topic" }, rung: { type: "integer", minimum: 2, maximum: 6 },
        pattern: { type: "string" }, statement: { type: "string", description: "Markdown statement with examples, in the course's style" }, starter_code: { type: "string" },
        reference_solution: { type: "string" }, test_code: { type: "string" }, max_changed_lines: { type: "integer", description: "R4 debug only" }, time_limit_min: { type: "integer" } },
        required: ["name", "topic", "rung", "statement", "starter_code", "reference_solution", "test_code"] } } },
    { type: "function", function: { name: "start_timer", description: "Visible countdown (quiz sims, timed problems).",
      parameters: { type: "object", properties: { minutes: { type: "number" }, label: { type: "string" } }, required: ["minutes"] } } },
    { type: "function", function: { name: "list_materials", description: "List the student's course materials (units, titles, types, paths).", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "read_material", description: "Read one course material by path.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
    { type: "function", function: { name: "update_tracker", description: "Create/update a topic row in the Mastery Tracker.",
      parameters: { type: "object", properties: { topic: { type: "string" }, level: { type: "string", description: "R0-R6 or ?" }, mastered: { type: "string", description: "yes/no" },
        review_outcome: { type: "string", enum: ["pass", "hard", "fail"], description: "For mastered topics / reviews: the app computes the next review date (expanding gaps: 2, 5, 12, 30, 75... days; hard = same gap; fail = now). Prefer this over next_review." },
        next_review: { type: "string", description: "YYYY-MM-DD or now (only when not using review_outcome)" }, notes: { type: "string" } }, required: ["topic"] } } },
    { type: "function", function: { name: "parsons", description: "R2 Parsons problem: the student puts the given code lines in the right order (optionally leaving out distractor lines). Builds code-structure skill with less typing; good right after a worked example.",
      parameters: { type: "object", properties: { prompt: { type: "string", description: "What the code should do (markdown)" }, lines: { type: "array", items: { type: "string" }, description: "The solution, one line per block, in the CORRECT order (keep indentation)" },
        distractors: { type: "array", items: { type: "string" }, description: "0-2 plausible wrong lines that don't belong (e.g. off-by-one, = vs ==)" } }, required: ["prompt", "lines"] } } },
    { type: "function", function: { name: "update_learner_profile", description: "Update one section of the student's Learner Profile (shared by all courses) when you've clearly observed how they learn best - with evidence, not guesses. Send the FULL new section (keep existing bullets).",
      parameters: { type: "object", properties: { section: { type: "string", enum: ["About me", "What works for me", "What doesn't work for me", "Things I want my coach to remember"] }, markdown: { type: "string", description: "Bullet list for the whole section" } }, required: ["section", "markdown"] } } },
    { type: "function", function: { name: "update_toolkit", description: "Create/update a building-block row in the Toolkit note (Task | Code | Status | Next review).",
      parameters: { type: "object", properties: { task: { type: "string" }, code: { type: "string" }, status: { type: "string", enum: ["new", "shaky", "solid"] }, next_review: { type: "string" } }, required: ["task"] } } },
    { type: "function", function: { name: "log_mistake", description: "Record a repeated mistake pattern (bumps Times seen if it exists).",
      parameters: { type: "object", properties: { mistake: { type: "string" }, example: { type: "string" }, fix: { type: "string" } }, required: ["mistake"] } } },
    { type: "function", function: { name: "save_pattern", description: "Add a Pattern Library entry, or REPLACE the entry with the same name (include the full entry).",
      parameters: { type: "object", properties: { name: { type: "string" }, markdown: { type: "string" } }, required: ["name", "markdown"] } } },
    { type: "function", function: { name: "append_blueprint", description: "Append findings about the class's assessment format to the Blueprint note.",
      parameters: { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"] } } },
    { type: "function", function: { name: "update_roadmap", description: "Replace the whole Roadmap note (title, units, - [ ] / - [x] topic checklists). Keep existing checkmarks.",
      parameters: { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"] } } },
  ];

  async function noteOp(path, a, label, icon) {
    const r = await CC.api(path, Object.assign({ folder: S.session.course.folder }, a));
    if (r.error) return { error: r.error };
    addItem({ kind: "sys", icon: icon || "check", text: label + (r.result ? " (" + r.result + ")" : "") });
    return { ok: true, result: r.result };
  }

  const HANDLERS = {
    async quiz(a) {
      if (!Array.isArray(a.options) || a.options.length < 2) return { error: "quiz needs at least 2 options" };
      if (!(a.correct_index >= 0 && a.correct_index < a.options.length)) return { error: "correct_index out of range" };
      const it = { kind: "quiz", question: a.question, code: a.code, options: a.options, correct_index: a.correct_index, explanation: a.explanation, sim: S.session.mode === "quizsim" };
      let card; const p = new Promise((res) => { card = quizCard(it, res); });
      const r = await Promise.race([p, waitFor(card)]);
      S.pending = null; clearHint();
      if (r.skipped && r.student_wrote === undefined) { card.classList.remove("live"); scheduleSave(); return r; }   // Stop pressed
      if (r.student_wrote !== undefined) {
        card.querySelectorAll("button").forEach((x) => (x.disabled = true)); card.classList.remove("live");
        addItem({ kind: "you", text: r.student_wrote }); noteAppend("**You:** " + r.student_wrote);
        return Object.assign({ skipped: true, student_message: r.student_wrote }, r.live_code ? { live_code: r.live_code } : {});
      }
      addItem(it, { render: false });
      noteAppend(quote("[!question] Quiz\n" + a.question + (a.code ? "\n```\n" + a.code + "\n```" : "") + "\n\n" +
        a.options.map((o, i) => (i === r.chosen_index ? "**" + String.fromCharCode(65 + i) + ". " + o + "**" : String.fromCharCode(65 + i) + ". " + o)).join("\n") +
        "\n\n" + (r.correct ? "Correct" : "Wrong - answer: " + String.fromCharCode(65 + a.correct_index)) + (a.explanation ? "\n\n" + a.explanation : "")));
      scheduleSave();
      return r;
    },
    async ask(a) {
      const it = { kind: "ask", question: a.question, choices: a.choices || [], allow_free_text: a.allow_free_text !== false };
      let card; const p = new Promise((res) => { card = askCard(it, res); });
      const r = await Promise.race([p, waitFor(card)]);
      S.pending = null; clearHint();
      if (r.skipped && r.student_wrote === undefined) { card.classList.remove("live"); scheduleSave(); return r; }   // Stop pressed
      if (r.student_wrote !== undefined) { it.answer = r.student_wrote; card.querySelectorAll("button,input").forEach((x) => (x.disabled = true)); card.classList.remove("live"); addItem({ kind: "you", text: r.student_wrote }, { save: false }); }
      addItem(it, { render: false });
      noteAppend(quote("[!question] " + a.question + "\nAnswer: " + it.answer));
      scheduleSave();
      return Object.assign({ answer: it.answer }, r.live_code ? { live_code: r.live_code } : {});
    },
    async run_code(a) {
      const r = await CC.api("/api/run_snippet", { language: a.language || L(), code: a.code || "", stdin: a.stdin || "" });
      addItem({ kind: "sys", icon: "play", text: CC.coachName() + " ran a quick check" }, { save: false });
      return { stdout: (r.stdout || "").slice(0, 5000), stderr: (r.stderr || "").slice(0, 2500), ok: r.ok, compile_error: !!r.compile_error, error: r.error };
    },
    async drill(a) {
      if (!a.harness || a.harness.indexOf("{{ANSWER}}") < 0) return { error: "harness must contain {{ANSWER}}" };
      const ref = await runDrillAnswer(a.harness, a.reference_answer || "");
      if (ref.compile_error || normOut(ref.stdout) !== normOut(a.expected_output)) {
        return { error: "Drill rejected: with your reference answer the harness printed " + JSON.stringify(normOut(ref.stdout)) + (ref.stderr ? " (stderr: " + ref.stderr.slice(0, 600) + ")" : "") +
          " but expected_output is " + JSON.stringify(normOut(a.expected_output)) + ". Fix it and call drill again." };
      }
      const it = { kind: "drill", prompt: a.prompt, harness: a.harness, expected_output: a.expected_output, reference_answer: a.reference_answer };
      let card; const p = new Promise((res) => { card = drillCard(it, res); });
      const r = await Promise.race([p, waitFor(card)]);
      S.pending = null; clearHint();
      if (r.skipped && r.student_wrote === undefined) { card.classList.remove("live"); scheduleSave(); return r; }   // Stop pressed
      if (r.student_wrote !== undefined) {
        card.querySelectorAll("button,textarea").forEach((x) => (x.disabled = true)); card.classList.remove("live");
        addItem({ kind: "you", text: r.student_wrote }); noteAppend("**You:** " + r.student_wrote);
        return Object.assign({ skipped: true, student_message: r.student_wrote }, r.live_code ? { live_code: r.live_code } : {});
      }
      addItem(it, { render: false });
      noteAppend(quote("[!example] Drill (R0)\n" + a.prompt + "\nTyped: `" + (r.answers || []).join("` | `") + "` - " + (r.correct ? "correct" : "missed") + "\nStandard: `" + a.reference_answer + "`"));
      scheduleSave();
      return r;
    },
    async give_problem(a) {
      const ref = await CC.api("/api/run_tests", { language: L(), code: a.reference_solution || "", tests: a.test_code || "" });
      if (!ref.ok) return { error: "Problem rejected: your reference solution does not pass your tests (stage: " + ref.stage + ").\n" + (ref.message || "").slice(0, 3000) + "\nFix the reference or tests and call give_problem again." };
      const st = await CC.api("/api/run_tests", { language: L(), code: a.starter_code || "", tests: a.test_code || "" });
      if (st.ok) return { error: "Problem rejected: the starter code already passes every test. The starter must be incomplete (or, for R4, contain a bug a test catches)." };
      const pr = { id: "p" + Date.now().toString(36), name: a.name, topic: a.topic, rung: a.rung, pattern: a.pattern || "", statement: a.statement,
        starter: a.starter_code, tests: a.test_code, maxChanged: a.max_changed_lines || null, timeLimit: a.time_limit_min || null,
        code: a.starter_code, startedAt: Date.now(), activeMs: 0, runningSince: null, runs: 0, hints: 0, status: "open", lastResult: null };
      S.session.problems.push(pr);
      addItem({ kind: "problem", id: pr.id, name: pr.name, rung: pr.rung, topic: pr.topic });
      noteAppend("### Problem: `" + a.name + "` (R" + a.rung + ", " + a.topic + (a.pattern ? ", " + a.pattern : "") + ")\n\n" + a.statement);
      showWorkspace(); renderProblemTabs(); selectProblem(pr.id);
      setTimeout(() => editor.focus(), 80);
      scheduleSave(0);
      return { status: "displayed in the editor", instruction: "STOP now and wait for the [PROBLEM RESULT], [STUCK] or [GAVE UP] message.", __wait: true };
    },
    async start_timer(a) {
      const mins = Math.max(0.5, Number(a.minutes) || 50);
      S.session.timer = { end: Date.now() + mins * 60000, remaining: null, label: a.label || "Timer", fired: false };
      if (S.session.paused) resumeClocks();
      startTimerLoop();
      addItem({ kind: "sys", icon: "timer", text: "Timer started: " + mins + " min" + (a.label ? " · " + a.label : "") });
      scheduleSave();
      return { started: true, minutes: mins };
    },
    async list_materials() {
      const r = await CC.api("/api/materials?" + CC.q({ folder: S.session.course.folder }));
      return r.error ? r : { units: (r.units || []).map((u) => ({ unit: u.name || "Unsorted", items: u.items.map((i) => ({ path: i.path, title: i.title, type: i.type, chars: i.chars })) })) };
    },
    async read_material(a) {
      const r = await CC.api("/api/material?" + CC.q({ folder: S.session.course.folder, path: a.path }));
      if (r.error) return r;
      addItem({ kind: "sys", icon: "file", text: CC.coachName() + " read: " + (r.meta.title || a.path) }, { save: false });
      return { title: r.meta.title, type: r.meta.type, content: (r.content || "").slice(0, 45000), truncated: (r.content || "").length > 45000 };
    },
    async update_tracker(a) {
      const r = await CC.api("/api/note/tracker", Object.assign({ folder: S.session.course.folder }, a));
      if (r.error) return { error: r.error };
      if (String(a.mastered).toLowerCase() === "yes") { CC.sfx && CC.sfx.play("levelup"); setTimeout(() => CC.celebrate && CC.celebrate(chat ? chat.lastElementChild || chat : document.body, true), 50); }
      addItem({ kind: "sys", icon: "chart", text: "Tracker · " + a.topic + (a.level ? " → " + a.level : "") + (a.mastered === "yes" ? " · mastered" : "") + (r.next_review ? " · next review " + r.next_review : "") });
      return { ok: true, result: r.result, next_review: r.next_review };
    },
    async update_learner_profile(a) {
      const r = await CC.api("/api/note/learner", Object.assign({ folder: S.session.course.folder }, { section: a.section, markdown: a.markdown }));
      if (r.error) return { error: r.error };
      addItem({ kind: "sys", icon: "brain", text: "Learner profile · " + a.section + " updated" });
      return { ok: true };
    },
    async parsons(a) {
      if (!Array.isArray(a.lines) || a.lines.length < 2) return { error: "parsons needs at least 2 lines" };
      const it = { kind: "parsons", prompt: a.prompt, lines: a.lines, distractors: a.distractors || [] };
      let card; const p = new Promise((res) => { card = parsonsCard(it, res); });
      const r = await Promise.race([p, waitFor(card)]);
      S.pending = null; clearHint();
      if (r.skipped && r.student_wrote === undefined) { card.classList.remove("live"); scheduleSave(); return r; }   // Stop pressed
      if (r.student_wrote !== undefined) {
        card.querySelectorAll("button").forEach((x) => (x.disabled = true)); card.classList.remove("live");
        addItem({ kind: "you", text: r.student_wrote }); noteAppend("**You:** " + r.student_wrote);
        return Object.assign({ skipped: true, student_message: r.student_wrote }, r.live_code ? { live_code: r.live_code } : {});
      }
      addItem(it, { render: false });
      noteAppend(quote("[!example] Parsons problem\n" + a.prompt + "\n\n" + (r.correct ? "Solved" : "Revealed") + " after " + r.attempts + " check(s)."));
      scheduleSave();
      return r;
    },
    async update_toolkit(a) { return noteOp("/api/note/toolkit", a, "Toolkit · " + a.task + (a.status ? " → " + a.status : ""), "layers"); },
    async log_mistake(a) { return noteOp("/api/note/mistake", a, "Mistakes · " + a.mistake, "flag"); },
    async save_pattern(a) { return noteOp("/api/note/pattern", a, "Pattern Library · " + a.name, "brain"); },
    async append_blueprint(a) { return noteOp("/api/note/blueprint", a, "Blueprint updated", "file"); },
    async update_roadmap(a) { return noteOp("/api/note/roadmap", a, "Roadmap updated", "flag"); },
  };

  // ================================================================== streaming LLM
  async function streamLLM(body, onText, signal) {
    let r;
    try {
      r = await fetch("/api/llm_stream", { method: "POST", headers: { "X-CC-Token": window.CC_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      return { error: "CodeCoach isn't running. Start it again, then reload this page." };
    }
    if (r.status === 403) return { error: "CodeCoach was restarted. Reload this page (Cmd+R) to reconnect." };
    if (!(r.headers.get("content-type") || "").includes("event-stream")) {
      const j = await r.json().catch(() => ({ error: "HTTP " + r.status }));
      return { error: j.error || "Unknown error" };
    }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", content = "", usage = null, err = null;
    const calls = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        let o; try { o = JSON.parse(p); } catch (e) { continue; }
        if (o.error) { err = o.error.message || JSON.stringify(o.error); continue; }
        if (o.usage) usage = o.usage;
        const ch = (o.choices || [])[0];
        if (!ch) continue;
        const d = ch.delta || {};
        if (d.content) { content += d.content; onText(content); }
        (d.tool_calls || []).forEach((tc) => {
          const i = tc.index != null ? tc.index : calls.length;
          const c = (calls[i] = calls[i] || { id: "", name: "", args: "" });
          if (tc.id) c.id = tc.id;
          if (tc.function) { if (tc.function.name && !c.name) c.name = tc.function.name; if (tc.function.arguments) c.args += tc.function.arguments; }
        });
      }
    }
    if (err) return { error: "AI error: " + err + (content ? " (the reply was cut off)" : "") };
    const tool_calls = calls.filter(Boolean).map((c, i) => ({ id: c.id || "call_" + Date.now().toString(36) + i, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
    return { message: { content, tool_calls: tool_calls.length ? tool_calls : undefined }, usage };
  }

  // ================================================================== agent loop
  async function ensureSystem() {
    if (S.sys && S.sysFor === S.session.id) return true;
    const sp = await CC.api("/api/system_prompt?" + CC.q({ folder: S.session.course.folder, mode: S.session.mode, topic: S.session.topic || "" }));
    if (sp.error) { addItem({ kind: "err", text: sp.error, retry: true }, { save: false }); return false; }
    S.sys = sp.prompt; S.sysFor = S.session.id;
    return true;
  }

  async function runAgent() {
    if (!S.session || S.busy) return;
    S.busy = true; setThinking(true);
    let autoRounds = 0;
    try {
      for (;;) {
        const gaps = toolGaps();
        if (gaps) gaps.forEach((c) => S.session.messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ error: "Interrupted. Ask again if still needed." }) }));
        await maybeCompact();
        if (!(await ensureSystem())) break;
        S.abort = new AbortController();
        let bubble = null, last = 0;
        const onText = (txt) => {
          if (!bubble) { setThinking(false); bubble = h("div", { class: "md" }); chat.appendChild(h("div", { class: "msg coach streaming" }, h("div", { class: "avatar", html: CC.coachAvatar() }), h("div", { class: "body" }, h("div", { class: "who", text: CC.coachName() }), bubble))); }
          const now = Date.now();
          if (now - last > 70) { last = now; bubble.innerHTML = MD.render(txt); scrollChat(); }
        };
        let res;
        try {
          res = await streamLLM({ messages: [{ role: "system", content: S.sys }].concat(S.session.messages), tools: TOOLS }, onText, S.abort.signal);
        } catch (e) {
          if (e.name === "AbortError") { if (bubble) bubble.closest('.msg').remove(); addItem({ kind: "sys", icon: "stop", text: "Stopped" }, { save: false }); break; }
          throw e;
        }
        if (res.error) { if (bubble) bubble.closest('.msg').remove(); addItem({ kind: "err", text: res.error, retry: true }, { save: false }); break; }
        const u = res.usage || {};
        S.session.usage.cost += Number(u.cost || 0);
        S.session.usage.tokens += Number(u.prompt_tokens || 0) + Number(u.completion_tokens || 0);
        S.session.lastPrompt = Number(u.prompt_tokens || 0);
        updateCost();
        const m = res.message;
        if (!(m.content || "").trim() && !(m.tool_calls || []).length) {
          if (bubble) bubble.closest(".msg").remove();
          addItem({ kind: "err", text: "The AI sent an empty reply (it may have run out of reply length). Press Retry, or raise \"Max reply length\" in Settings.", retry: true }, { save: false });
          break;
        }
        const msg = { role: "assistant", content: m.content || "" };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        S.session.messages.push(msg);
        if (msg.content.trim()) {
          if (!msg.tool_calls) CC.sfx && CC.sfx.play("message");
          if (bubble) { MD.into(bubble, msg.content); bubble.closest(".msg").classList.remove("streaming"); S.session.display.push({ kind: "coach", text: msg.content }); }
          else addItem({ kind: "coach", text: msg.content });
          noteAppend(msg.content);
        } else if (bubble) bubble.closest('.msg').remove();
        scrollChat();
        scheduleSave(0);
        if (!msg.tool_calls) break;
        setThinking(false);
        const r = await processToolCalls(msg.tool_calls);
        setThinking(true);
        scheduleSave(0);
        if (S.stopReq) { S.stopReq = false; addItem({ kind: "sys", icon: "stop", text: "Stopped" }, { save: false }); break; }
        if (r.wait) break;
        autoRounds = r.interactive ? 0 : autoRounds + 1;
        if (autoRounds > 12) { addItem({ kind: "sys", icon: "stop", text: "Paused after many automatic steps - send a message to continue." }); break; }
      }
    } catch (e) {
      addItem({ kind: "err", text: "Something went wrong: " + e.message, retry: true }, { save: false });
    } finally {
      S.busy = false; S.abort = null; S.stopReq = false; setThinking(false); clearHint(); await saveNow();
      const i = $("input"); if (i && !S.pending) i.focus();
      if (S.queue && S.queue.length && S.session) { const [t, sh] = S.queue.shift(); setTimeout(() => sendUser(t, sh), 50); }
    }
  }

  // Every assistant tool call must be followed by a tool result before the next API call. If the app was closed
  // mid-step, older gaps get a placeholder result; the latest step's missing calls are returned to be re-run.
  function toolGaps() {
    const ms = S.session.messages;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (m.role !== "assistant" || !m.tool_calls || !m.tool_calls.length) continue;
      let j = i + 1; const have = new Set();
      while (j < ms.length && ms[j].role === "tool") { have.add(ms[j].tool_call_id); j++; }
      const missing = m.tool_calls.filter((c) => !have.has(c.id));
      if (!missing.length) continue;
      if (j >= ms.length) return missing;
      ms.splice(j, 0, ...missing.map((c) => ({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ error: "Interrupted (the app was closed or reloaded). Ask again if still needed." }) })));
      i = j + missing.length - 1;
    }
    return null;
  }

  async function processToolCalls(calls) {
    let wait = false, interactive = false;
    const ms = S.session.messages;
    let from = ms.length - 1; while (from >= 0 && ms[from].role !== "assistant") from--;
    for (const c of calls) {
      if (ms.slice(from + 1).some((m) => m.role === "tool" && m.tool_call_id === c.id)) continue;
      let args = {}, result;
      if (S.stopReq) { S.session.messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ skipped: true, note: "The student pressed Stop." }) }); continue; }
      try { args = JSON.parse(c.function.arguments || "{}"); } catch (e) { result = { error: "Arguments were not valid JSON: " + e.message }; }
      const fn = HANDLERS[c.function.name];
      if (!result) {
        if (!fn) result = { error: "Unknown tool " + c.function.name };
        else { try { result = await fn(args); } catch (e) { result = { error: "Tool failed: " + e.message }; } }
      }
      if (["quiz", "ask", "drill", "parsons"].includes(c.function.name)) interactive = true;
      if (result && result.__wait) { wait = true; delete result.__wait; }
      S.session.messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
    return { wait, interactive };
  }

  // keep long sessions cheap: summarize older turns once the prompt gets big
  async function maybeCompact() {
    const s = S.session;
    const limit = Number(S.state.config.compact_at || 40000);
    if (!s.lastPrompt || s.lastPrompt < limit || s.messages.length < 16) return;
    let cut = -1;
    for (let i = s.messages.length - 10; i > 2; i--) {
      const m = s.messages[i];
      if (m.role === "user" && typeof m.content === "string") { cut = i; break; }
    }
    if (cut < 0) return;
    setThinking(true, "Tidying up the conversation to keep it fast and cheap");
    const transcript = s.messages.slice(0, cut).map((m) => {
      if (m.role === "tool") return "[tool result] " + String(m.content).slice(0, 600);
      let t = (m.role === "user" ? "STUDENT: " : "COACH: ") + (m.content || "");
      if (m.tool_calls) t += "\n[tools: " + m.tool_calls.map((c) => c.function.name + " " + String(c.function.arguments).slice(0, 300)).join(" | ") + "]";
      return t;
    }).join("\n\n").slice(-120000);
    const r = await CC.api("/api/llm", { messages: [
      { role: "system", content: "You summarize a tutoring session for the tutor so it can continue seamlessly. Include: topics covered and how solid each is; every problem given and its result; drills and quiz results; misconceptions noticed; where we are in the plan (current node, rung); the plan going forward; anything promised to the student. Compact but complete, max ~700 words, markdown bullets." },
      { role: "user", content: transcript }], max_tokens: 2000 });
    setThinking(false);
    if (r.error || !r.message) return;
    s.messages = [{ role: "user", content: "[SESSION SUMMARY SO FAR] (earlier conversation, condensed by the app)\n\n" + (r.message.content || "") },
      { role: "assistant", content: "Got it - continuing from where we left off." }].concat(s.messages.slice(cut));
    s.lastPrompt = 0;
    S.sys = null;
    addItem({ kind: "sys", icon: "layers", text: "Condensed the earlier conversation to keep the session fast and cheap" }, { save: false });
    await saveNow();
  }

  // The coach always sees what is in the editor right now (only when it changed), so its guidance
  // uses the student's real variable names and line numbers.
  function liveCode() {
    const p = curProblem && curProblem();
    if (!p || !editor || p.status !== "open") return "";
    const code = editor.get();
    p.code = code;
    if (code === p.lastShared || code.trim() === (p.starter || "").trim()) return "";
    p.lastShared = code;
    return "\n\n[LIVE CODE - this is exactly what I have in the editor for " + p.name + " right now (not submitted). " +
      "Use MY variable names, method names and line numbers (line 1 = first line) when you guide me; don't rename things.]\n" + fence(code);
  }

  function sendUser(text, shown) {
    if (!S.session) return;
    if (!shown) resumeClocks();
    if (S.pending && !shown) { const lc = liveCode(); S.pending.resolve(lc ? { student_wrote: text, live_code: lc.trim() } : { student_wrote: text }); return; }
    if (S.busy) {
      if (shown) { (S.queue = S.queue || []).push([text, shown]); return; }   // app results (submit, timer...) wait their turn
      CC.toast(CC.coachName() + " is still working - press Stop to interrupt."); return;
    }
    if (shown) { const p = curProblem && curProblem(); if (p && editor && /My current code|My last code|Final code|my code/i.test(text)) p.lastShared = editor.get(); }
    S.session.messages.push({ role: "user", content: shown ? text : text + liveCode() });
    addItem({ kind: shown ? "sys" : "you", icon: "send", text: shown || text });
    noteAppend(shown ? "*" + shown + "*" : "**You:** " + text);
    scrollChat(true);
    runAgent();
  }
  CC.sendToCoach = sendUser;

  // ================================================================== sessions
  const newId = () => CC.today() + "-" + Math.random().toString(36).slice(2, 8);

  async function startSession(mode, topic, materialPaths, pasted) {
    const c = S.course;
    const title = topic || MODES[mode].label;
    const r = await CC.api("/api/note/session_start", { folder: c.folder, title, mode: MODES[mode].label });
    if (r.error) return CC.toast(r.error, true);
    S.session = { id: newId(), title, mode, topic: topic || "", note: r.note, materials: materialPaths,
      course: { name: c.name, folder: c.folder, language: c.language, type: c.type },
      messages: [], display: [], problems: [], usage: { cost: 0, tokens: 0 }, created: new Date().toISOString() };
    S.sys = null;
    renderSession();
    let first = "[SESSION START] Session type: " + MODES[mode].label + ". Topic: " + (topic || "(not specified - suggest one from my roadmap/tracker)") + ".";
    let shown = MODES[mode].label + " session" + (topic ? " · " + topic : "");
    const texts = [];
    let total = 0;
    for (const p of materialPaths) {
      const m = await CC.api("/api/material?" + CC.q({ folder: c.folder, path: p }));
      if (!m.error) { texts.push({ p, m }); total += (m.content || "").length; }
    }
    if (texts.length) {
      shown += " · " + texts.length + " material" + (texts.length > 1 ? "s" : "");
      if (total <= 45000) first += "\n\nMaterials I selected for this session (blueprint and seed, not the syllabus):\n\n" +
        texts.map((t) => "--- " + t.p + " (" + (t.m.meta.title || "") + ", " + (t.m.meta.type || "") + ") ---\n" + t.m.content).join("\n\n");
      else first += "\n\nMaterials I selected for this session (too long to include - read them with read_material):\n" + texts.map((t) => "- " + t.p + " (" + t.m.meta.title + ", " + t.m.meta.type + ")").join("\n");
    }
    if (pasted) { first += "\n\nMaterial I pasted (blueprint and seed, not the syllabus):\n<<<\n" + pasted + "\n>>>"; shown += " · pasted material"; }
    S.session.messages.push({ role: "user", content: first });
    addItem({ kind: "you", text: shown });
    noteAppend("**You:** " + shown);
    await saveNow();
    runAgent();
  }

  async function resumeSession(id, opts) {
    opts = opts || {};
    if (S.session && S.session.id === id && chat && document.body.contains(chat)) { if (S.view !== "study") CC.go("study"); return; }
    if (S.session && !(await leaveSession())) return;
    const s = await CC.api("/api/session?" + CC.q({ id }));
    if (s.error) { if (!opts.quiet) CC.toast(s.error, true); return; }
    s.usage = s.usage || { cost: 0, tokens: 0 }; s.display = s.display || []; s.problems = s.problems || [];
    S.session = s; S.sys = null; S.pending = null;
    const c = (S.state.courses || []).find((x) => x.folder === s.course.folder);
    if (c && (!S.course || S.course.folder !== c.folder)) { S.course = c; CC.$("courseSelect").value = c.folder; CC.local.set("course", c.folder); }
    const upd = Math.min(Date.now(), Date.parse(s.updated || "") || Date.now());
    s.problems.forEach((p) => {
      migrateClock(p);
      if (p.runningSince) { p.activeMs += Math.max(0, upd - p.runningSince); p.runningSince = null; }   // stop at the last save
    });
    if (s.timer && !s.timer.fired && s.timer.end) { s.timer.remaining = Math.max(0, s.timer.end - upd); s.timer.end = null; }
    s.paused = true;                       // stays stopped while the page rebuilds...
    if (S.view !== "study") CC.go("study", { keep: true });
    if (!sessionShown()) renderSession();
    if (opts.reload && s.userPaused) { S.pauseText = "Still paused, like before the page reloaded. Press Resume (or type / run code) to continue."; updatePauseUI(); }
    else resumeClocks();                   // ...then continues exactly where it stopped
    addItem({ kind: "sys", icon: "refresh", text: opts.reload ? "Page reloaded - you're right where you were (code, chat and timers kept)" : "Resumed - your notes, progress and timers are as you left them" }, { save: false });
    const pending = toolGaps();
    const last = s.messages[s.messages.length - 1];
    if (pending && pending.length) {
      S.busy = true;
      const r = await processToolCalls(pending);
      S.busy = false;
      await saveNow();
      if (!r.wait && !S.stopReq) runAgent();
      S.stopReq = false;
    } else if (last && last.role === "user") {
      addItem({ kind: "err", text: CC.coachName() + " hadn't answered your last message yet.", retry: true }, { save: false });
    } else if (last && last.role === "tool") {
      runAgent();
    }
  }
  CC.resumeSession = resumeSession;

  // ================================================================== workspace / problems
  function showWorkspace() {
    const split = document.querySelector(".split");
    if (split && split.classList.contains("nowork")) { split.classList.remove("nowork"); CC.local.set("wsHidden", false); }
  }
  const curProblem = () => S.session && S.session.problems.find((p) => p.id === S.activeProblem);

  function renderProblemTabs() {
    const tabs = $("wsTabs"); if (!tabs) return;
    tabs.innerHTML = "";
    S.session.problems.forEach((p) => tabs.appendChild(h("button", { class: (p.id === S.activeProblem ? "on " : "") + (p.status === "solved" ? "solved" : ""), text: p.name, title: p.topic + " · R" + p.rung + " · " + p.status, onclick: () => selectProblem(p.id) })));
    const has = S.session.problems.length > 0;
    $("wsEmpty").classList.toggle("hidden", has);
    $("wsMain").classList.toggle("hidden", !has);
    $("wsActions").classList.toggle("hidden", !has);
  }

  function selectProblem(id) {
    const cur = curProblem();
    if (cur && cur.status === "open") cur.code = editor.get();
    S.session.problems.forEach(freezeProblem);              // only the problem you're looking at counts time
    S.activeProblem = id;
    const np = curProblem();
    if (np && np.status === "open" && !S.session.paused) np.runningSince = Date.now();
    const p = curProblem();
    if (!p) return renderProblemTabs();
    const st = $("pStatement");
    st.innerHTML = "";
    st.appendChild(h("div", { class: "statement-head" }, h("h3", { text: p.name }), h("span", { class: "chip accent", text: "R" + p.rung }), h("span", { class: "chip", text: p.topic }),
      p.maxChanged ? h("span", { class: "chip warn", text: "max " + p.maxChanged + " changed line" + (p.maxChanged > 1 ? "s" : "") }) : null,
      p.status !== "open" ? h("span", { class: "chip " + (p.status === "solved" ? "good" : "bad"), text: p.status }) : null));
    st.appendChild(MD.into(h("div"), p.statement));
    editor.mode(S.session.course.language);
    editor.set(p.code);
    editor.refresh();
    showOutput(p.lastResult);
    renderProblemTabs();
    updateProblemButtons();
    tickClock();
  }

  // The problem clock repaints once a second only while it is actually running and visible - no idle wake-ups.
  let clockTimer = null;
  function tickClock() {
    clearTimeout(clockTimer); clockTimer = null;
    paintClock();
    const p = curProblem();
    if (!document.hidden && $("pClock") && S.session && !S.session.paused && p && p.status === "open")
      clockTimer = setTimeout(tickClock, 1000 - (elapsedMs(p) % 1000) + 15);
  }
  function paintClock() {
    const p = curProblem(), c = $("pClock");
    if (!c) return;
    if (!p) { c.textContent = ""; return; }
    c.textContent = p.status === "open" ? (S.session.paused ? "⏸ " : "") + elapsed(p) + (p.timeLimit ? " / " + p.timeLimit + "m" : "") : (p.solvedIn ? "solved in " + p.solvedIn : p.status);
    c.classList.toggle("warn", p.status === "open" && !!p.timeLimit && elapsedMs(p) > p.timeLimit * 60000);
    c.title = "Time on this problem (pauses when you pause, close the session or the app)";
  }

  function updateProblemButtons() {
    const p = curProblem(), closed = !p || p.status !== "open";
    ["submitBtn", "stuckBtn", "giveupBtn"].forEach((id) => { const b = $(id); if (b) b.disabled = closed || S.busy; });
  }

  function showOutput(r) {
    const o = $("pOutput");
    if (!o) return;
    if (!r) { o.classList.add("hidden"); return; }
    o.classList.remove("hidden");
    o.innerHTML = "";
    let head;
    if (r.stage === "compile") head = h("div", { class: "out-head" }, h("span", { class: "chip bad", text: "Doesn't compile" }), h("span", { class: "muted small", text: "Fix the error below, then run again" }));
    else if (r.stage === "test_compile") head = h("div", { class: "out-head" }, h("span", { class: "chip warn", text: "Test setup problem" }));
    else head = h("div", { class: "out-head" }, h("span", { class: "chip " + (r.ok ? "good" : "bad") + " progress-pill", text: r.passed + " / " + r.total + " passed" }),
      r.timed_out ? h("span", { class: "chip warn", text: "timed out" }) : null, h("span", { class: "spacer" }), h("span", { class: "muted tiny", text: r.ms != null ? r.ms + " ms" : "" }));
    o.appendChild(head);
    const body = h("div", { class: "out-body" });
    if (r.stage === "run") {
      (r.message || "").split("\n").forEach((l) => {
        if (l.startsWith("PASS")) body.appendChild(h("div", { class: "tline pass" }, h("span", { class: "ic", text: "✓" }), h("span", { text: l.slice(4).trim() })));
        else if (l.startsWith("FAIL") || l.startsWith("CRASH")) body.appendChild(h("div", { class: "tline fail" }, h("span", { class: "ic", text: "✗" }), h("span", { text: l.replace(/^(FAIL|CRASH)\s*/, "") })));
        else if (l.trim()) body.appendChild(h("div", { class: "tline" }, h("span", { class: "ic" }), h("span", { text: l })));
      });
    } else body.textContent = r.message || "";
    if (r.extra) body.appendChild(h("div", { class: "tline fail" }, h("span", { class: "ic", text: "!" }), h("span", { text: r.extra })));
    o.appendChild(body);
  }

  async function runCurrent() {
    const p = curProblem(); if (!p) return null;
    resumeClocks();
    p.code = editor.get();
    const rb = $("runBtn"); rb.disabled = true;
    const o = $("pOutput"); o.classList.remove("hidden"); o.innerHTML = '<div class="out-head"><span class="dots"><span></span><span></span><span></span></span><span class="muted small">Running tests...</span></div>';
    const r = await CC.api("/api/run_tests", { language: L(), code: p.code, tests: p.tests });
    rb.disabled = false;
    if (r.error) { CC.toast(r.error, true); showOutput(p.lastResult); return null; }
    p.runs++; p.lastResult = r;
    if (p.maxChanged && r.ok) {
      const c = await CC.api("/api/changed_lines", { original: p.starter, code: p.code });
      if (c.changed > p.maxChanged) { r.ok = false; r.extra = "You changed " + c.changed + " lines; the limit is " + p.maxChanged + "."; }
    }
    showOutput(r);
    CC.sfx && CC.sfx.play(r.ok ? "pass" : "fail");
    scheduleSave();
    return r;
  }

  // ---- active time: counts only while the problem is on screen and the session isn't paused
  function migrateClock(p) {
    if (p.activeMs != null) return;
    const until = Math.min(Date.now(), Date.parse(S.session.updated || "") || Date.now());   // old sessions: count up to the last save only
    p.activeMs = Math.max(0, until - (p.startedAt || until)); p.runningSince = null;
  }
  function elapsedMs(p) { migrateClock(p); return p.activeMs + (p.runningSince ? Date.now() - p.runningSince : 0); }
  function freezeProblem(p) { migrateClock(p); if (p.runningSince) { p.activeMs += Date.now() - p.runningSince; p.runningSince = null; } }
  function elapsed(p) { const s = Math.round(elapsedMs(p) / 1000); return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s"; }

  function pauseClocks(silent, text) {
    const s = S.session; if (!s) return;
    if (!silent) s.userPaused = true;      // you pressed Pause / End session (not just closing the window)
    if (s.paused) return;
    s.paused = true;
    s.problems.forEach(freezeProblem);
    const t = s.timer;
    if (t && !t.fired && t.end) { t.remaining = Math.max(0, t.end - Date.now()); t.end = null; }
    S.pauseText = text || "Paused - timers are stopped. Type in the editor, run code, send a message or press Resume to continue.";
    updatePauseUI();
    if (!silent) { scheduleSave(0); CC.toast("Timers paused"); CC.sfx && CC.sfx.play("toggle"); }
  }
  function resumeClocks() {
    const s = S.session; if (!s || !s.paused) return;
    s.paused = false; s.userPaused = false;
    const p = curProblem();
    if (p && p.status === "open") { migrateClock(p); p.runningSince = Date.now(); }
    const t = s.timer;
    if (t && !t.fired && t.remaining != null) { t.end = Date.now() + t.remaining; t.remaining = null; startTimerLoop(); }
    updatePauseUI(); scheduleSave(0);
  }
  CC.pauseStudy = pauseClocks; CC.resumeStudy = resumeClocks;
  function updatePauseUI() {
    const s = S.session; if (!s) return;
    const b = $("pauseBtn"), ban = $("pauseBanner");
    const hasClock = s.problems.some((p) => p.status === "open") || (s.timer && !s.timer.fired);
    if (b) { b.innerHTML = s.paused ? CC.icon("play") + "<span>Resume</span>" : CC.icon("pause") + "<span>Pause</span>"; b.classList.toggle("hidden", !hasClock && !s.paused); }
    if (ban) { ban.classList.toggle("hidden", !s.paused || !hasClock); const tx = $("pauseText"); if (tx) tx.textContent = S.pauseText || "Paused - timers are stopped."; }
    const v = document.querySelector(".sess-bar"); if (v) v.classList.toggle("paused", !!s.paused);
    tickClock();
    const tb = $("timerBadge"), t = s.timer;
    if (tb && t && !t.fired && t.remaining != null) { const left = Math.round(t.remaining / 1000); tb.textContent = "⏸ " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); }
  }
  // stepping away for more than 5 minutes without pausing: that time doesn't count either
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (S.session) tickClock();
    const s = S.session, gap = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = null;
    if (!s || s.paused || gap < 5 * 60000) return;
    s.problems.forEach((p) => { if (p.runningSince) p.runningSince += gap; });
    if (s.timer && !s.timer.fired && s.timer.end) s.timer.end += gap;
    else if (s.timer && s.timer.fired && !s.problems.some((p) => p.status === "open")) return;
    scheduleSave(0);
    CC.toast("Welcome back - the " + Math.round(gap / 60000) + " min you were away didn't count on the timers.");
  });

  async function submitCurrent() {
    const p = curProblem(); if (!p || S.busy || p.status !== "open") return;
    const r = await runCurrent();
    if (!r) return;
    if (!r.ok) { CC.toast(r.stage === "compile" ? "It doesn't compile yet." : "Not all tests pass yet - keep going, or press I'm stuck."); return; }
    if (p.status !== "open") return;
    freezeProblem(p); p.status = "solved"; p.solvedIn = elapsed(p);
    setTimeout(() => { CC.sfx && CC.sfx.play("solve"); CC.celebrate && CC.celebrate($("pStatement") || document.body, true); }, 120);
    renderProblemTabs(); selectProblem(p.id);
    CC.api("/api/note/save_practice", { folder: S.session.course.folder, topic: p.topic, name: p.name, language: L(), statement: p.statement, code: p.code, result: "solved in " + p.solvedIn + ", " + p.runs + " runs, " + p.hints + " hints" });
    sendUser("[PROBLEM RESULT] " + p.name + " (R" + p.rung + ", " + p.topic + "): all " + r.total + " tests passed. Time: " + p.solvedIn + ". Test runs: " + p.runs + ". Times I pressed I'm stuck: " + p.hints + ".\nFinal code:\n" + fence(p.code),
      "Submitted " + p.name + " · all " + r.total + " tests passed in " + p.solvedIn);
  }

  async function stuckCurrent() {
    const p = curProblem(); if (!p || S.busy) return;
    const r = await runCurrent();
    p.hints++;
    sendUser("[STUCK] " + p.name + " (R" + p.rung + ", " + p.topic + "): " + (r ? (r.stage === "compile" ? "does not compile" : r.passed + "/" + r.total + " tests pass") : "") + ". Time so far: " + elapsed(p) + ".\nMy current code:\n" + fence(p.code) +
      "\nLatest output:\n```\n" + ((r && r.message) || "").slice(0, 2500) + "\n```", "I'm stuck on " + p.name + (r && r.stage === "run" ? " (" + r.passed + "/" + r.total + " passing)" : ""));
  }

  async function giveUpCurrent() {
    const p = curProblem(); if (!p || S.busy) return;
    if (!(await CC.confirm("Give up on " + p.name + "?", "Your coach will walk you through a solution. No shame - it's how you learn the pattern.", "Give up"))) return;
    p.code = editor.get(); freezeProblem(p); p.status = "gave up";
    renderProblemTabs(); selectProblem(p.id);
    CC.api("/api/note/save_practice", { folder: S.session.course.folder, topic: p.topic, name: p.name, language: L(), statement: p.statement, code: p.code, result: "gave up after " + elapsed(p) });
    sendUser("[GAVE UP] " + p.name + " (R" + p.rung + ", " + p.topic + ") after " + elapsed(p) + ". My last code:\n" + fence(p.code), "Gave up on " + p.name);
  }

  // ================================================================== timer
  let timerInt = null;
  function startTimerLoop() {
    clearInterval(timerInt);
    const b = $("timerBadge"); if (!b) return;
    b.classList.remove("hidden");
    timerInt = setInterval(() => {
      const t = S.session && S.session.timer;
      const badge = $("timerBadge");
      if (!t || !badge) return clearInterval(timerInt);
      if (S.session.paused || !t.end) return;
      const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
      badge.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      badge.classList.toggle("low", left < 300);
      if (left === 0 && !t.fired) {
        t.fired = true; badge.textContent = "Time's up"; CC.sfx && CC.sfx.play("timer"); scheduleSave(0); clearInterval(timerInt);
        const sid = S.session.id;
        const fire = () => { if (!S.session || S.session.id !== sid) return; if (S.busy || S.pending) return setTimeout(fire, 3000); sendUser("[TIMER] Time is up for: " + (t.label || "the timer") + ".", "Time is up"); };
        fire();
      }
    }, 1000);
  }

  // ================================================================== view hooks
  CC.views.study = {
    show(opts) {
      if (S.session && (!opts || !opts.fresh)) { if (!sessionShown()) renderSession(); else editor && editor.refresh(); return; }
      if (opts && opts.fresh && S.session) { leaveSession().then((ok) => { if (ok) { $("studyBadge").classList.add("hidden"); renderStart(opts); } }); return; }
      $("studyBadge").classList.add("hidden");
      renderStart(opts);
    },
  };
})();
