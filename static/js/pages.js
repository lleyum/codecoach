/* CodeCoach pages: Today, Materials, Playground, Progress, Settings, New course. */
(function () {
  "use strict";
  const S = CC.S, h = CC.h, $ = CC.$;
  const icon = CC.icon;
  const btn = (label, ic, onclick, cls, title) => h("button", { class: "btn " + (cls || ""), html: (ic ? icon(ic) : "") + (label ? "<span>" + MD.esc(label) + "</span>" : ""), onclick, title });
  const page = (viewId) => { const v = $(viewId); v.innerHTML = ""; const inner = h("div", { class: "page-inner" }); v.appendChild(h("div", { class: "page" }, inner)); return inner; };
  const noCourse = (inner) => inner.appendChild(h("div", { class: "empty" }, h("div", { html: icon("book") }),
    h("h3", { text: "No course yet" }), h("p", { text: "Create a class (organized from your class content) or a general track like \"Learn C++\"." }),
    btn("New course or track", "plus", () => CC.views.newCourse(), "primary")));
  const levelNum = (lv) => { const m = String(lv || "").match(/\d/); return m ? Math.min(6, +m[0]) : 0; };
  const obsidianLink = (abs) => "obsidian://open?path=" + encodeURIComponent(/^[A-Za-z]:\\/.test(abs) ? abs.replace(/\//g, "\\") : abs);
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  // ================================================================== TODAY
  CC.views.today = {
    async show() {
      const inner = page("view-today");
      if (!S.course) return noCourse(inner);
      const c = S.course;
      const hr = new Date().getHours();
      const greet = hr < 5 ? "Late night session" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
      inner.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", { text: greet }),
        h("div", { class: "sub", text: c.name + " · " + CC.lang(c.language).label + (c.type === "general" ? " · general track" : " · class") })),
        h("span", { class: "spacer" }), btn("Start studying", "play", () => CC.go("study", { fresh: !S.session }), "primary")));
      if (S.session) {
        inner.appendChild(h("div", { class: "banner" }, h("span", { html: icon("chat") }),
          h("span", { text: "Session in progress: " + (S.session.title || "study session") }), h("span", { class: "spacer" }),
          btn("Return to session", "arrow", () => CC.go("study"), "sm primary")));
      }
      const d = await CC.api("/api/dashboard?" + CC.q({ folder: c.folder }));
      if (d.error) { inner.appendChild(h("div", { class: "card", text: d.error })); return; }
      const due = d.topics.filter((t) => t.due && t.mastered !== "yes");
      const mastered = d.topics.filter((t) => /yes/i.test(t.mastered)).length;
      const stat = (v, k, ic) => h("div", { class: "card stat" }, h("div", { class: "k", html: icon(ic, "si") + MD.esc(k) }), h("div", { class: "v", text: String(v) }));
      inner.appendChild(h("div", { class: "stats" },
        stat(d.streak + (d.streak === 1 ? " day" : " days"), "Streak", "flame"),
        stat(due.length, "Reviews due", "refresh"),
        stat(mastered + " / " + d.topics.length, "Topics mastered", "target"),
        stat(d.toolkit.solid + " / " + d.toolkit.total, "Toolkit solid", "bolt"),
        stat(d.week_solved, "Solved this week", "check")));

      const left = h("div", { class: "stack" }), right = h("div", { class: "stack" });
      inner.appendChild(h("div", { class: "today-grid" }, left, right));

      // Up next
      const next = d.next && !/^\(/.test(d.next) ? d.next : null;
      const upnext = h("div", { class: "card" }, h("h3", { html: icon("flag") + "Up next" }));
      if (next) {
        upnext.appendChild(h("div", { class: "next-line" }, h("div", { class: "t" }, h("b", { text: next }), h("div", { class: "hint", text: "Next unchecked item on your roadmap" })),
          btn("Learn it", "play", () => CC.go("study", { fresh: true, mode: "learn", topic: next }), "primary sm")));
      } else {
        upnext.appendChild(h("p", { class: "muted small", text: c.type === "general"
          ? "Your roadmap is empty. Start a Learn session - the coach asks about your background and writes your roadmap."
          : "Your roadmap is empty. Add class materials (syllabus, slides) and start a session - the coach builds the roadmap from them." }));
        upnext.appendChild(h("div", { class: "quick" }, btn("Plan my roadmap", "spark", () => CC.go("study", { fresh: true, mode: "learn", topic: "Plan my roadmap" }), "sm primary"),
          c.type === "class" ? btn("Add materials", "upload", () => CC.go("materials"), "sm") : null));
      }
      left.appendChild(upnext);

      // Due reviews
      const dueCard = h("div", { class: "card" }, h("h3", { html: icon("refresh") + "Spaced review" }));
      if (due.length) {
        const list = h("div", { class: "list" });
        due.slice(0, 8).forEach((t) => list.appendChild(h("div", { class: "item" }, h("span", { class: "chip warn", text: "R" + levelNum(t.level) }),
          h("span", { class: "t", text: t.topic }), btn("Review", null, () => CC.go("study", { fresh: true, mode: "review", topic: t.topic }), "sm"))));
        dueCard.appendChild(list);
        if (due.length > 1) dueCard.appendChild(h("div", { class: "row", style: { marginTop: "8px" } }, h("span", { class: "spacer" }),
          btn("Review all " + due.length, "refresh", () => CC.go("study", { fresh: true, mode: "review", topic: due.map((t) => t.topic).join(", ") }), "sm primary")));
      } else dueCard.appendChild(h("p", { class: "muted small", text: "Nothing due. Topics come back here when their review is due, with the gap growing each time you pass (2, 5, 12, 30, 75 days...)." }));
      left.appendChild(dueCard);

      // Recent sessions
      const sc = h("div", { class: "card" }, h("h3", { html: icon("chat") + "Recent sessions" }));
      if (d.sessions.length) {
        const list = h("div", { class: "list" });
        d.sessions.slice(0, 5).forEach((s) => list.appendChild(h("div", { class: "item" },
          h("span", { class: "chip", text: s.mode || "learn" }), h("span", { class: "t", text: s.title || "Session" }),
          h("span", { class: "tiny muted", text: CC.fmtTime(s.updated) + (s.problems ? " · " + s.solved + "/" + s.problems + " solved" : "") }),
          btn("Resume", null, () => { CC.go("study"); CC.resumeSession(s.id); }, "sm"))));
        sc.appendChild(list);
      } else sc.appendChild(h("p", { class: "muted small", text: "Your sessions will appear here. Everything saves automatically." }));
      left.appendChild(sc);

      // Mastery
      const mc = h("div", { class: "card" }, h("h3", { html: icon("chart") + "Mastery" }));
      if (d.topics.length) {
        const bars = h("div", { class: "bars" });
        d.topics.slice().sort((a, b) => levelNum(b.level) - levelNum(a.level)).slice(0, 12).forEach((t) => {
          const n = levelNum(t.level), done = /yes/i.test(t.mastered);
          bars.appendChild(h("div", { class: "bar-row", title: t.topic + " - next review " + (t.next || "-") }, h("span", { class: "name", text: t.topic }),
            h("div", { class: "bar" + (done ? " done" : "") }, h("span", { style: { width: (done ? 100 : Math.round(n / 6 * 100)) + "%" } })),
            h("span", { class: "lv", text: done ? "done" : "R" + n })));
        });
        mc.appendChild(bars);
        if (d.topics.length > 12) mc.appendChild(h("button", { class: "btn ghost sm", text: "See all " + d.topics.length + " topics", onclick: () => CC.go("progress"), style: { marginTop: "8px" } }));
      } else mc.appendChild(h("p", { class: "muted small", text: "Topics appear as you learn them. Each climbs the ladder R0 (syntax) to R6 (timed, from scratch)." }));
      right.appendChild(mc);

      // Quick actions
      right.appendChild(h("div", { class: "card" }, h("h3", { html: icon("bolt") + "Quick start" }), h("div", { class: "quick" },
        btn("Syntax drills", "bolt", () => CC.go("study", { fresh: true, mode: "drill" }), "sm"),
        btn("Quiz simulation", "timer", () => CC.go("study", { fresh: true, mode: "quizsim" }), "sm"),
        btn("Playground", "code", () => CC.go("playground"), "sm"),
        btn("Materials", "folder", () => CC.go("materials"), "sm"),
        btn("Notes", "book", () => CC.go("progress"), "sm")),
        d.toolkit.weak ? h("p", { class: "hint", style: { margin: "10px 0 0" }, text: plural(d.toolkit.weak, "toolkit line") + " to drill (new, shaky or due)." }) : null));
      CC.usageLine();
    },
  };

  // ================================================================== MATERIALS
  const TYPE_LABEL = { lesson: "Lesson", slides: "Slides", "practice-quiz": "Practice quiz", "quiz-feedback": "Quiz feedback", homework: "Homework", notes: "Notes", code: "Code", other: "Other" };
  const typeLabel = (t) => TYPE_LABEL[t] || t;
  const CODE_EXT = /\.(java|py|cpp|cc|c|h|hpp|js|ts|go|rs|kt)$/i;
  function guessType(name) {
    const n = name.toLowerCase();
    if (CODE_EXT.test(n)) return "code";
    if (/feedback|graded|results?/.test(n)) return "quiz-feedback";
    if (/quiz|exam|midterm|practice/.test(n)) return "practice-quiz";
    if (/slide|lecture|\.pptx$/.test(n)) return "slides";
    if (/\bhw\b|homework|assignment|lab|mp\d/.test(n)) return "homework";
    if (/lesson|chapter|reading/.test(n)) return "lesson";
    return "notes";
  }
  const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](file); });
  let pdfLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfLoading) pdfLoading = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = "/vendor/pdf.min.js";
      s.onload = () => { if (!window.pdfjsLib) return rej(new Error("PDF reader unavailable")); window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js"; res(window.pdfjsLib); };
      s.onerror = () => { pdfLoading = null; rej(new Error("Couldn't load the PDF reader (needs internet the first time).")); };
      document.head.appendChild(s);
    });
    return pdfLoading;
  }
  async function fileToText(file) {
    if (file.size > 40 * 1024 * 1024) throw new Error(file.name + " is too big (40 MB max).");
    if (/\.pdf$/i.test(file.name)) {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await readAs(file, "readAsArrayBuffer")) }).promise;
      const parts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        let t = "";
        tc.items.forEach((it) => { t += it.str + (it.hasEOL ? "\n" : ""); });
        parts.push("## Page " + i + "\n" + t.replace(/[ \t]+\n/g, "\n").trim());
      }
      const text = parts.join("\n\n");
      if (text.replace(/## Page \d+/g, "").trim().length < 20) throw new Error(file.name + " looks like a scanned PDF (no text). Paste the text instead.");
      return text;
    }
    if (/\.(png|jpe?g|gif|heic|mp4|mov|zip)$/i.test(file.name)) throw new Error(file.name + ": images/videos/zips aren't supported - paste the text instead.");
    const data = (await readAs(file, "readAsDataURL")).split(",")[1] || "";
    const r = await CC.api("/api/extract", { filename: file.name, data });
    if (r.error) throw new Error(file.name + ": " + r.error);
    return r.text;
  }

  const M = { units: [], unit: null, sel: new Set(), filter: "", type: "" };
  CC.views.materials = {
    async show() {
      const inner = page("view-materials");
      if (!S.course) return noCourse(inner);
      M.sel.clear();
      const studyBtn = btn("Study selected", "play", () => CC.go("study", { fresh: true, materials: [...M.sel] }), "primary");
      studyBtn.disabled = true;
      M.studyBtn = studyBtn;
      inner.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", { text: "Materials" }),
        h("div", { class: "sub", text: "Your class content, organized by unit. The coach uses it to teach exactly what your class tests." })),
        h("span", { class: "spacer" }), btn("New unit", "plus", newUnit), btn("Add material", "upload", () => addModal([]), ""), studyBtn));
      const drop = h("div", { class: "drop" }, h("span", { html: icon("upload") }),
        h("div", null, h("b", { text: "Drop files here" }), " - PDF, Word, PowerPoint, notebooks, code, text. Or ",
          h("a", { href: "#", text: "browse", onclick: (e) => { e.preventDefault(); pick.click(); } }), "."));
      const pick = h("input", { type: "file", multiple: true, class: "hidden", onchange: () => { addModal([...pick.files]); pick.value = ""; } });
      inner.appendChild(drop); inner.appendChild(pick);
      const v = $("view-materials");
      v.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
      v.ondragleave = (e) => { if (!v.contains(e.relatedTarget)) drop.classList.remove("over"); };
      v.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files.length) addModal([...e.dataTransfer.files]); };
      M.box = h("div", { class: "mat" });
      inner.appendChild(M.box);
      await loadMaterials();
    },
  };
  async function loadMaterials() {
    const r = await CC.api("/api/materials?" + CC.q({ folder: S.course.folder }));
    if (r.error) { CC.toast(r.error, true); return; }
    M.units = r.units;
    if (M.unit !== null && M.unit !== "*" && !M.units.find((u) => u.name === M.unit)) M.unit = null;
    renderMaterials();
  }
  function renderMaterials() {
    const box = M.box; if (!box) return;
    box.innerHTML = "";
    const all = M.units.flatMap((u) => u.items);
    const ul = h("div", { class: "units card" });
    const ubtn = (key, label, n, ic) => {
      const on = (M.unit === null ? "*" : M.unit) === key;
      const b = h("button", { class: "u" + (on ? " on" : ""), html: icon(ic) + "<span>" + MD.esc(label) + "</span><span class='n'>" + n + "</span>" });
      b.onclick = () => { M.unit = key; renderMaterials(); };
      b.ondragover = (e) => { if (key !== "*") { e.preventDefault(); b.classList.add("on"); } };
      b.ondragleave = () => { if (!on) b.classList.remove("on"); };
      b.ondrop = async (e) => { const p = e.dataTransfer.getData("text/cc-material"); if (!p) return; e.preventDefault(); e.stopPropagation(); await moveMaterial(p, key === "" ? "" : key); };
      return b;
    };
    ul.appendChild(ubtn("*", "All materials", all.length, "layers"));
    const loose = M.units.find((u) => u.name === "");
    if (loose) ul.appendChild(ubtn("", "Unsorted", loose.items.length, "file"));
    M.units.filter((u) => u.name).forEach((u) => ul.appendChild(ubtn(u.name, u.name, u.items.length, "folder")));
    ul.appendChild(h("button", { class: "u", html: icon("plus") + "<span>New unit</span>", onclick: newUnit }));
    box.appendChild(ul);

    const key = M.unit === null ? "*" : M.unit;
    let items = key === "*" ? all : ((M.units.find((u) => u.name === key) || { items: [] }).items);
    const q = M.filter.toLowerCase();
    if (q) items = items.filter((it) => it.title.toLowerCase().includes(q) || (it.unit || "").toLowerCase().includes(q));
    if (M.type) items = items.filter((it) => it.type === M.type);

    const search = h("input", { type: "search", placeholder: "Search materials", value: M.filter });
    search.oninput = CC.debounce(() => { M.filter = search.value; renderMaterials(); const s = M.box.querySelector("input[type=search]"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 150);
    const tsel = h("select", null, h("option", { value: "", text: "All types" }), ...(S.state.material_types || []).map((t) => h("option", { value: t, text: typeLabel(t) })));
    tsel.value = M.type; tsel.onchange = () => { M.type = tsel.value; renderMaterials(); };
    const head = h("div", { class: "row mat-head" }, search, tsel, h("span", { class: "spacer" }));
    if (key !== "*" && key !== "") {
      head.appendChild(btn("", "edit", () => renameUnit(key), "ghost icon", "Rename unit"));
      head.appendChild(btn("", "trash", () => deleteUnit(key), "ghost icon danger", "Delete unit (must be empty)"));
    }
    if (items.length) {
      const allBox = h("input", { type: "checkbox", title: "Select all shown" });
      allBox.checked = items.every((it) => M.sel.has(it.path));
      allBox.onchange = () => { items.forEach((it) => (allBox.checked ? M.sel.add(it.path) : M.sel.delete(it.path))); renderMaterials(); };
      head.prepend(allBox);
    }
    const listCard = h("div", { class: "card mat-list" }, head);
    if (!items.length) {
      listCard.appendChild(h("div", { class: "empty" }, h("div", { html: icon("folder") }),
        h("h3", { text: all.length ? "Nothing here" : "No materials yet" }),
        h("p", { text: all.length ? "Try another unit or search." : "Add slides, lessons, practice quizzes and quiz feedback. Organize them into units (Week 1, Lists, Recursion...)." }),
        all.length ? null : btn("Add material", "upload", () => addModal([]), "primary")));
    }
    items.forEach((it) => {
      const cb = h("input", { type: "checkbox" }); cb.checked = M.sel.has(it.path);
      cb.onchange = () => { cb.checked ? M.sel.add(it.path) : M.sel.delete(it.path); updateSel(); };
      const row = h("div", { class: "mat-row", draggable: "true" }, cb,
        h("div", { class: "t", onclick: () => openMaterial(it) }, h("b", { text: it.title }),
          h("span", { class: "tiny muted", text: (key === "*" && it.unit ? it.unit + " · " : "") + (it.added || "") + " · " + Math.max(1, Math.round(it.chars / 1000)) + "k chars" })),
        h("span", { class: "chip", text: typeLabel(it.type) }),
        h("div", { class: "acts" }, btn("", "play", () => CC.go("study", { fresh: true, materials: [it.path] }), "ghost icon sm", "Study this"),
          btn("", "edit", () => editMaterial(it), "ghost icon sm", "Edit / move"),
          btn("", "trash", () => deleteMaterial(it), "ghost icon sm danger", "Delete")));
      row.ondragstart = (e) => { e.dataTransfer.setData("text/cc-material", it.path); e.dataTransfer.effectAllowed = "move"; };
      listCard.appendChild(row);
    });
    if (all.length) listCard.appendChild(h("div", { class: "hint", style: { padding: "8px 10px 0" }, text: "Tip: drag a material onto a unit to move it. Select several and press Study selected to build a session around them." }));
    box.appendChild(listCard);
    updateSel();
  }
  function updateSel() {
    if (!M.studyBtn) return;
    M.studyBtn.disabled = !M.sel.size;
    M.studyBtn.querySelector("span").textContent = M.sel.size ? "Study " + plural(M.sel.size, "item") : "Study selected";
  }
  const unitNames = () => M.units.filter((u) => u.name).map((u) => u.name);
  function unitSelect(cur) {
    const sel = h("select", null, h("option", { value: "", text: "Unsorted" }), ...unitNames().map((n) => h("option", { value: n, text: n })), h("option", { value: "__new", text: "+ New unit..." }));
    sel.value = cur || "";
    sel.onchange = async () => {
      if (sel.value !== "__new") return;
      const name = window.prompt("New unit name (e.g. Week 3 - Lists)");
      if (!name || !name.trim()) { sel.value = cur || ""; return; }
      sel.insertBefore(h("option", { value: name.trim(), text: name.trim() }), sel.lastChild);
      sel.value = name.trim();
    };
    return sel;
  }
  async function newUnit() {
    const name = await CC.prompt("New unit", "Name (e.g. Week 3 - Lists, or Recursion)", "");
    if (!name) return;
    const r = await CC.api("/api/materials/unit", { folder: S.course.folder, op: "create", name });
    if (r.error) return CC.toast(r.error, true);
    M.unit = null; await loadMaterials();
    const made = M.units.find((u) => u.name && u.name.toLowerCase().startsWith(name.toLowerCase().slice(0, 10)));
    if (made) { M.unit = made.name; renderMaterials(); }
  }
  async function renameUnit(name) {
    const nn = await CC.prompt("Rename unit", "New name", name);
    if (!nn || nn === name) return;
    const r = await CC.api("/api/materials/unit", { folder: S.course.folder, op: "rename", name, new_name: nn });
    if (r.error) return CC.toast(r.error, true);
    M.unit = null; await loadMaterials();
  }
  async function deleteUnit(name) {
    if (!(await CC.confirm("Delete unit \"" + name + "\"?", "Only empty units can be deleted - move or delete its materials first.", "Delete", true))) return;
    const r = await CC.api("/api/materials/unit", { folder: S.course.folder, op: "delete", name });
    if (r.error) return CC.toast(r.error, true);
    M.unit = null; await loadMaterials();
  }
  async function getMaterial(path) { return CC.api("/api/material?" + CC.q({ folder: S.course.folder, path })); }
  async function moveMaterial(path, unit) {
    const it = M.units.flatMap((u) => u.items).find((x) => x.path === path);
    if (!it || (it.unit || "") === unit) return;
    const m = await getMaterial(path);
    if (m.error) return CC.toast(m.error, true);
    const r = await CC.api("/api/materials/save", { folder: S.course.folder, path, title: it.title, type: it.type, unit, content: m.content, source: m.meta.source });
    if (r.error) return CC.toast(r.error, true);
    CC.toast("Moved to " + (unit || "Unsorted"));
    if (M.sel.delete(path)) M.sel.add(r.path);
    await loadMaterials();
  }
  async function openMaterial(it) {
    const m = await getMaterial(it.path);
    if (m.error) return CC.toast(m.error, true);
    const body = h("div", { class: "md mat-view" });
    MD.into(body, m.content);
    CC.modal(it.title, h("div", null, h("div", { class: "row", style: { marginBottom: "10px" } }, h("span", { class: "chip accent", text: typeLabel(it.type) }),
      h("span", { class: "chip", text: it.unit || "Unsorted" }), it.added ? h("span", { class: "tiny muted", text: "added " + it.added }) : null,
      m.meta.source ? h("span", { class: "tiny muted", text: "from " + m.meta.source }) : null), body),
      [btn("Delete", "trash", () => deleteMaterial(it), "ghost danger"), h("span", { class: "spacer" }),
        btn("Edit", "edit", () => editMaterial(it, m), ""), btn("Study this", "play", () => { CC.closeModal(); CC.go("study", { fresh: true, materials: [it.path] }); }, "primary")], { wide: true, noFocus: true });
  }
  async function editMaterial(it, loaded) {
    const m = loaded || await getMaterial(it.path);
    if (m.error) return CC.toast(m.error, true);
    materialForm({ path: it.path, title: it.title, type: it.type, unit: it.unit, content: m.content, source: m.meta.source }, "Edit material");
  }
  function materialForm(d, heading) {
    const title = h("input", { type: "text", value: d.title || "" });
    const type = h("select", null, ...(S.state.material_types || []).map((t) => h("option", { value: t, text: typeLabel(t) })));
    type.value = d.type || "notes";
    const unit = unitSelect(d.unit);
    const content = h("textarea", { class: "mono", rows: 16, placeholder: "Paste the text here: lesson notes, slide text, a practice quiz, your quiz feedback..." });
    content.value = d.content || "";
    const count = h("span", { class: "hint" });
    const upd = () => { count.textContent = content.value.length.toLocaleString() + " characters"; };
    content.oninput = upd; upd();
    const save = async () => {
      if (!title.value.trim()) { title.focus(); return CC.toast("Give it a title.", true); }
      if (!content.value.trim()) { content.focus(); return CC.toast("It's empty.", true); }
      const r = await CC.api("/api/materials/save", { folder: S.course.folder, path: d.path, title: title.value.trim(), type: type.value, unit: unit.value === "__new" ? "" : unit.value, content: content.value, source: d.source });
      if (r.error) return CC.toast(r.error, true);
      CC.closeModal(); CC.toast(d.path ? "Saved" : "Added to Materials"); loadMaterials();
    };
    content.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } });
    CC.modal(heading, h("div", { class: "stack" },
      h("div", { class: "grid3" }, h("div", { class: "field" }, h("label", { text: "Title" }), title), h("div", { class: "field" }, h("label", { text: "Type" }), type), h("div", { class: "field" }, h("label", { text: "Unit" }), unit)),
      h("div", { class: "field" }, h("label", { text: "Content (Markdown)" }), content, count)),
    [btn("Cancel", null, CC.closeModal, "ghost"), btn("Save", "save", save, "primary")], { wide: true, sticky: true });
  }
  async function deleteMaterial(it) {
    if (!(await CC.confirm("Delete \"" + it.title + "\"?", "It moves to materials/_trash in your Library, so you can still recover it.", "Delete", true))) return;
    const r = await CC.api("/api/materials/delete", { folder: S.course.folder, path: it.path });
    if (r.error) return CC.toast(r.error, true);
    M.sel.delete(it.path); CC.closeModal(); CC.toast("Moved to trash"); loadMaterials();
  }
  async function addModal(files) {
    if (!S.course) return;
    const curUnit = M.unit && M.unit !== "*" ? M.unit : "";
    if (!files.length) return materialForm({ unit: curUnit, type: "notes" }, "Add material");
    // files: extract each, show a review list, save all
    const rows = files.map((f) => ({ file: f, title: f.name.replace(/\.[^.]+$/, ""), type: guessType(f.name), status: "Reading...", text: null }));
    const unit = unitSelect(curUnit);
    const list = h("div", { class: "list" });
    const saveBtn = btn("Add " + plural(rows.length, "file"), "upload", null, "primary");
    saveBtn.disabled = true;
    const draw = () => {
      list.innerHTML = "";
      rows.forEach((r) => {
        const t = h("input", { type: "text", value: r.title }); t.oninput = () => (r.title = t.value);
        const ty = h("select", null, ...(S.state.material_types || []).map((x) => h("option", { value: x, text: typeLabel(x) }))); ty.value = r.type; ty.onchange = () => (r.type = ty.value);
        list.appendChild(h("div", { class: "item add-row" }, t, ty,
          h("span", { class: "chip " + (r.text ? "good" : r.error ? "bad" : ""), text: r.error ? "Error" : r.text ? Math.round(r.text.length / 1000) + "k chars" : r.status, title: r.error || "" }),
          r.text ? btn("", "file", () => { const pv = h("div", { class: "md" }); MD.into(pv, r.text.slice(0, 20000)); CC.toast("Preview below"); list.appendChild(pv); }, "ghost icon sm", "Preview") : null));
      });
    };
    draw();
    CC.modal("Add materials", h("div", { class: "stack" }, h("div", { class: "field" }, h("label", { text: "Put in unit" }), unit), list,
      h("p", { class: "hint", text: "Text is extracted on your computer and saved as Markdown in your course's materials folder. Scanned PDFs (pictures of text) can't be read - paste those instead." })),
    [btn("Cancel", null, CC.closeModal, "ghost"), saveBtn], { wide: true, sticky: true, noFocus: true });
    for (const r of rows) {
      try { r.text = await fileToText(r.file); } catch (e) { r.error = e.message; CC.toast(e.message, true); }
      draw();
    }
    const ok = rows.filter((r) => r.text);
    saveBtn.disabled = !ok.length;
    saveBtn.querySelector("span").textContent = "Add " + plural(ok.length, "file");
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      for (const r of ok) {
        const res = await CC.api("/api/materials/save", { folder: S.course.folder, title: r.title || r.file.name, type: r.type, unit: unit.value === "__new" ? "" : unit.value, content: r.text, source: r.file.name });
        if (res.error) CC.toast(r.file.name + ": " + res.error, true);
      }
      CC.closeModal(); CC.toast("Added " + plural(ok.length, "file")); loadMaterials();
    };
  }
  CC.addMaterialFiles = addModal;

  // ================================================================== PLAYGROUND
  const TEMPLATES = {
    java: [
      ["Scratch (just statements)", '// Write statements directly - CodeCoach wraps them in main() for you.\nint[] nums = {3, 1, 4, 1, 5};\nint sum = 0;\nfor (int n : nums) {\n    sum += n;\n}\nSystem.out.println("sum = " + sum);\n'],
      ["Class with main", 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CS 124!");\n    }\n}\n'],
      ["Method + test calls", 'public class Main {\n    static int countEven(int[] values) {\n        int count = 0;\n        for (int v : values) {\n            if (v % 2 == 0) {\n                count++;\n            }\n        }\n        return count;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(countEven(new int[] {1, 2, 3, 4})); // 2\n        System.out.println(countEven(new int[] {}));           // 0\n    }\n}\n'],
      ["Read input (Scanner)", 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt();\n        int total = 0;\n        for (int i = 0; i < n; i++) {\n            total += in.nextInt();\n        }\n        System.out.println(total);\n    }\n}\n', "3\n10 20 30\n"],
      ["Object / class design", 'public class Main {\n    static class Counter {\n        private int count;\n\n        Counter(int start) {\n            count = start;\n        }\n\n        void increment() {\n            count++;\n        }\n\n        int getCount() {\n            return count;\n        }\n\n        @Override\n        public String toString() {\n            return "Counter(" + count + ")";\n        }\n    }\n\n    public static void main(String[] args) {\n        Counter c = new Counter(5);\n        c.increment();\n        System.out.println(c);\n    }\n}\n'],
      ["Linked list node", 'public class Main {\n    static class Node {\n        int value;\n        Node next;\n        Node(int value, Node next) {\n            this.value = value;\n            this.next = next;\n        }\n    }\n\n    static int size(Node head) {\n        int n = 0;\n        for (Node cur = head; cur != null; cur = cur.next) {\n            n++;\n        }\n        return n;\n    }\n\n    public static void main(String[] args) {\n        Node head = new Node(1, new Node(2, new Node(3, null)));\n        System.out.println(size(head)); // 3\n    }\n}\n'],
      ["Recursion", 'public class Main {\n    static int sumDigits(int n) {\n        if (n < 10) {\n            return n;\n        }\n        return n % 10 + sumDigits(n / 10);\n    }\n\n    public static void main(String[] args) {\n        System.out.println(sumDigits(1234)); // 10\n    }\n}\n'],
    ],
    python: [["Scratch", 'nums = [3, 1, 4, 1, 5]\nprint("sum =", sum(nums))\n'], ["Function + tests", 'def count_even(values):\n    return sum(1 for v in values if v % 2 == 0)\n\n\nprint(count_even([1, 2, 3, 4]))  # 2\nprint(count_even([]))  # 0\n'],
      ["Read input", 'n = int(input())\nnums = list(map(int, input().split()))\nprint(sum(nums[:n]))\n', "3\n10 20 30\n"]],
    cpp: [["Hello", '#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    vector<int> nums = {3, 1, 4, 1, 5};\n    int sum = 0;\n    for (int n : nums) sum += n;\n    cout << "sum = " << sum << endl;\n    return 0;\n}\n'],
      ["Read input", '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n, total = 0;\n    cin >> n;\n    for (int i = 0; i < n; i++) {\n        int x;\n        cin >> x;\n        total += x;\n    }\n    cout << total << endl;\n}\n', "3\n10 20 30\n"],
      ["Class", '#include <iostream>\n#include <string>\nusing namespace std;\n\nclass Counter {\n  public:\n    explicit Counter(int start) : count_(start) {}\n    void increment() { count_++; }\n    int count() const { return count_; }\n  private:\n    int count_;\n};\n\nint main() {\n    Counter c(5);\n    c.increment();\n    cout << c.count() << endl;\n}\n']],
    c: [["Hello", '#include <stdio.h>\n\nint main(void) {\n    int nums[] = {3, 1, 4, 1, 5};\n    int sum = 0;\n    for (int i = 0; i < 5; i++) sum += nums[i];\n    printf("sum = %d\\n", sum);\n    return 0;\n}\n']],
    javascript: [["Scratch", 'const nums = [3, 1, 4, 1, 5];\nconsole.log("sum =", nums.reduce((a, b) => a + b, 0));\n']],
    go: [["Hello", 'package main\n\nimport "fmt"\n\nfunc main() {\n\tnums := []int{3, 1, 4, 1, 5}\n\tsum := 0\n\tfor _, n := range nums {\n\t\tsum += n\n\t}\n\tfmt.Println("sum =", sum)\n}\n']],
    rust: [["Hello", 'fn main() {\n    let nums = vec![3, 1, 4, 1, 5];\n    let sum: i32 = nums.iter().sum();\n    println!("sum = {}", sum);\n}\n']],
  };
  const EXT = { java: "java", python: "py", cpp: "cpp", c: "c", javascript: "js", go: "go", rust: "rs" };
  const EXT_LANG = { java: "java", py: "python", cpp: "cpp", cc: "cpp", c: "c", js: "javascript", go: "go", rs: "rust" };
  const PG = { lang: null, ed: null, name: "", running: false, last: null, history: [] };

  CC.views.playground = {
    show() {
      const v = $("view-playground");
      if (!PG.ed) buildPlayground(v);
      PG.ed.refresh();
      setTimeout(() => PG.ed.focus(), 30);
    },
  };
  function buildPlayground(v) {
    v.innerHTML = "";
    const langs = Object.keys(EXT);
    PG.lang = CC.local.get("pg_lang", null) || (S.course && langs.includes(S.course.language) ? S.course.language : "java");
    const langSel = h("select", { title: "Language" }, ...langs.map((k) => { const L = CC.lang(k); return h("option", { value: k, text: L.label + (L.available ? "" : " (not installed)") }); }));
    langSel.value = PG.lang;
    const tplSel = h("select", { title: "Start from a template" });
    const nameIn = h("input", { type: "text", class: "name", placeholder: "untitled", title: "Snippet name (Cmd+S saves)" });
    const runBtn = h("button", { class: "btn primary", html: icon("play") + "<span>Run</span><span class='kbd'>⌘↵</span>", title: "Run (Cmd+Enter)" });
    const askBtn = btn("Ask AI", "spark", () => toggleAsk(), "", "Explain an error or ask about this code");
    const bar = h("div", { class: "pg-bar" }, langSel, tplSel, h("span", { class: "sep" }), nameIn,
      btn("", "save", () => saveSnippet(), "ghost icon", "Save snippet (Cmd+S)"), btn("", "folder", () => openSnippets(), "ghost icon", "Open saved snippets"),
      btn("", "plus", () => newScratch(), "ghost icon", "New blank file"), btn("", "list", () => PG.ed.format(), "ghost icon", "Re-indent code (Shift+Cmd+F)"),
      btn("", "download", () => downloadFile(), "ghost icon", "Download as a file"),
      h("span", { class: "spacer" }), h("span", { class: "tiny muted", id: "pgSaved" }), askBtn, runBtn);

    const edHost = h("div", { class: "editor" });
    const left = h("div", { class: "pg-left" }, h("div", { class: "editor-wrap" }, edHost));
    const stdin = h("textarea", { placeholder: "Input for your program (System.in / input() / cin). One value per line or space-separated.", spellcheck: "false" });
    const consoleEl = h("div", { class: "console", id: "pgConsole" });
    const status = h("div", { class: "status-line", id: "pgStatus" }, h("span", { text: "Ready" }));
    const askBox = h("div", { class: "ask-box hidden", id: "pgAsk" });
    const inPane = h("div", { class: "pg-in" }, stdin);
    const inTitle = h("div", { class: "pane-title" }, h("span", { text: "Input" }), h("span", { class: "spacer" }),
      h("button", { class: "btn ghost sm", text: CC.local.get("pg_in_open", false) ? "Hide" : "Show", onclick: (e) => { const open = inPane.classList.toggle("hidden"); e.target.textContent = open ? "Show" : "Hide"; CC.local.set("pg_in_open", !open); } }));
    if (!CC.local.get("pg_in_open", false)) inPane.classList.add("hidden");
    const outTitle = h("div", { class: "pane-title" }, h("span", { text: "Output" }), h("span", { class: "spacer" }),
      h("button", { class: "btn ghost sm", text: "Copy", onclick: () => navigator.clipboard.writeText(consoleEl.innerText).then(() => CC.toast("Output copied")) }),
      h("button", { class: "btn ghost sm", text: "Clear", onclick: () => { consoleEl.innerHTML = ""; PG.last = null; } }));
    const right = h("div", { class: "pg-right" }, inTitle, inPane, outTitle, consoleEl, status, askBox);
    const splitter = h("div", { class: "splitter" });
    const split = h("div", { class: "pg-split" }, left, splitter, right);
    v.appendChild(h("div", { class: "pg" }, bar, split));

    PG.ed = CC.makeEditor(edHost, PG.lang, { run: () => run(), save: () => saveSnippet() });
    if (PG.ed.cm) PG.ed.cm.addKeyMap({ "Shift-Cmd-F": () => PG.ed.format(), "Shift-Ctrl-F": () => PG.ed.format() });
    PG.stdin = stdin; PG.console = consoleEl; PG.status = status; PG.nameIn = nameIn; PG.runBtn = runBtn; PG.askBox = askBox;

    const fillTemplates = () => {
      tplSel.innerHTML = "";
      tplSel.appendChild(h("option", { value: "", text: "Templates..." }));
      (TEMPLATES[PG.lang] || []).forEach((t, i) => tplSel.appendChild(h("option", { value: String(i), text: t[0] })));
    };
    const loadDraft = () => {
      const d = CC.local.get("pg_draft_" + PG.lang, null);
      PG.ed.mode(PG.lang);
      if (d && d.code != null) { PG.ed.set(d.code); stdin.value = d.stdin || ""; nameIn.value = d.name || ""; }
      else { const t = (TEMPLATES[PG.lang] || [["", ""]])[0]; PG.ed.set(t[1]); stdin.value = t[2] || ""; nameIn.value = ""; }
      fillTemplates();
      const L = CC.lang(PG.lang);
      setStatus(L.available ? "Ready · " + L.label : L.label + " isn't installed on this computer", !L.available);
    };
    PG.loadDraft = loadDraft;
    const saveDraft = CC.debounce(() => {
      CC.local.set("pg_draft_" + PG.lang, { code: PG.ed.get(), stdin: stdin.value, name: nameIn.value });
      const s = $("pgSaved"); if (s) s.textContent = "Draft saved";
    }, 400);
    PG.ed.onChange(() => { const s = $("pgSaved"); if (s) s.textContent = ""; saveDraft(); });
    stdin.oninput = saveDraft; nameIn.oninput = saveDraft;
    nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") saveSnippet(); });
    langSel.onchange = () => { saveDraftNow(); PG.lang = langSel.value; CC.local.set("pg_lang", PG.lang); consoleEl.innerHTML = ""; PG.last = null; loadDraft(); PG.ed.focus(); };
    PG.langSel = langSel;
    tplSel.onchange = async () => {
      const t = (TEMPLATES[PG.lang] || [])[+tplSel.value]; tplSel.value = "";
      if (!t) return;
      if (PG.ed.get().trim() && !(await CC.confirm("Replace your code?", "Load the \"" + t[0] + "\" template? Your current code will be replaced (save it first if you want to keep it).", "Replace"))) return;
      PG.ed.set(t[1]); stdin.value = t[2] || ""; if (t[2]) { inPane.classList.remove("hidden"); } nameIn.value = ""; saveDraft(); PG.ed.focus();
    };
    runBtn.onclick = () => run();

    let drag = false;
    splitter.addEventListener("mousedown", (e) => { drag = true; e.preventDefault(); document.body.style.cursor = "col-resize"; });
    window.addEventListener("mouseup", () => { if (drag) { drag = false; document.body.style.cursor = ""; PG.ed.refresh(); CC.local.set("pg_split", left.style.flex); } });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const r = split.getBoundingClientRect();
      left.style.flex = "0 0 " + Math.min(78, Math.max(30, ((e.clientX - r.left) / r.width) * 100)) + "%";
    });
    const sp = CC.local.get("pg_split", null); if (sp) left.style.flex = sp;
    loadDraft();
    consoleEl.appendChild(h("div", { class: "muted", html: "Press <kbd>⌘</kbd> <kbd>↵</kbd> to run. Errors are clickable and jump to the line. Drafts save automatically per language." }));
  }
  function saveDraftNow() { if (PG.ed) CC.local.set("pg_draft_" + PG.lang, { code: PG.ed.get(), stdin: PG.stdin.value, name: PG.nameIn.value }); }
  function setStatus(text, bad, extra) {
    const s = PG.status; s.innerHTML = "";
    s.appendChild(h("span", { class: "dot " + (bad ? "bad" : "good") }));
    s.appendChild(h("span", { text }));
    if (extra) s.appendChild(extra);
  }
  function lineLinks(text, cls) {
    // make "Main.java:12:" / "line 12" / "solution.py", line 12 clickable
    const frag = document.createDocumentFragment();
    const re = /((?:[\w.]+\.(?:java|py|cpp|c|h|js|go|rs)):(\d+)(?::\d+)?|line (\d+))/g;
    String(text).split("\n").forEach((line, i, arr) => {
      const span = h("span", { class: cls || "" });
      let last = 0, m;
      while ((m = re.exec(line))) {
        span.appendChild(document.createTextNode(line.slice(last, m.index)));
        const n = +(m[2] || m[3]);
        span.appendChild(h("a", { href: "#", class: "lnk", text: m[0], title: "Jump to line " + n, onclick: (e) => { e.preventDefault(); jumpTo(n); } }));
        last = m.index + m[0].length;
      }
      span.appendChild(document.createTextNode(line.slice(last) + (i < arr.length - 1 ? "\n" : "")));
      frag.appendChild(span);
    });
    return frag;
  }
  function jumpTo(n) {
    const cm = PG.ed && PG.ed.cm; if (!cm) return;
    const line = Math.max(0, Math.min(cm.lineCount() - 1, n - 1));
    cm.focus(); cm.setCursor({ line, ch: cm.getLine(line).search(/\S|$/) });
    cm.scrollIntoView({ line, ch: 0 }, 120);
    const mark = cm.addLineClass(line, "background", "cm-flash");
    setTimeout(() => cm.removeLineClass(mark, "background", "cm-flash"), 1400);
  }
  let errMarks = [];
  function markErrors(text) {
    const cm = PG.ed && PG.ed.cm; if (!cm) return;
    errMarks.forEach((l) => cm.removeLineClass(l, "background", "cm-errline")); errMarks = [];
    const re = /[\w.]+\.(?:java|py|cpp|c|h|js|go|rs):(\d+)|line (\d+)/g; let m;
    while ((m = re.exec(text || ""))) {
      const ln = +(m[1] || m[2]) - 1;
      if (ln >= 0 && ln < cm.lineCount()) errMarks.push(cm.addLineClass(ln, "background", "cm-errline"));
    }
  }
  async function run() {
    if (PG.running) return;
    const L = CC.lang(PG.lang);
    if (!L.available) return CC.toast(L.label + " isn't installed on this computer. See Settings > Languages for how to install it.", true);
    const code = PG.ed.get();
    if (!code.trim()) return CC.toast("Nothing to run yet.");
    PG.running = true; PG.runBtn.disabled = true;
    const c = PG.console;
    c.innerHTML = "";
    c.appendChild(h("div", { class: "muted", text: (/java|cpp|^c$|rust|go/.test(PG.lang) ? "Compiling and running" : "Running") + "..." }));
    setStatus("Running...", false);
    const t0 = performance.now();
    const r = await CC.api("/api/run_snippet", { language: PG.lang, code, stdin: PG.stdin.value });
    PG.running = false; PG.runBtn.disabled = false;
    c.innerHTML = "";
    PG.last = { code, result: r };
    if (r.error) { c.appendChild(h("span", { class: "err", text: r.error })); setStatus("Error", true); return; }
    if (r.stdout) c.appendChild(document.createTextNode(r.stdout.length > 200000 ? r.stdout.slice(0, 200000) + "\n... (output cut off)" : r.stdout));
    if (r.stdout && r.stderr && !r.stdout.endsWith("\n")) c.appendChild(document.createTextNode("\n"));
    if (r.stderr) c.appendChild(lineLinks(r.stderr, r.compile_error || !r.ok ? "err" : "warnl"));
    if (!r.stdout && !r.stderr) c.appendChild(h("span", { class: "muted", text: "(no output)" }));
    markErrors(r.stderr);
    const ms = r.ms != null ? r.ms : Math.round(performance.now() - t0);
    const askErr = (!r.ok) ? h("button", { class: "btn sm", style: { marginLeft: "auto" }, html: icon("spark") + "<span>Explain this error</span>", onclick: () => toggleAsk(true) }) : null;
    if (r.compile_error) setStatus("Didn't compile", true, askErr);
    else if (r.timed_out) setStatus("Stopped: took too long", true, askErr);
    else if (!r.ok) setStatus("Exited with code " + r.exit_code + " · " + ms + " ms", true, askErr);
    else setStatus("Finished · " + ms + " ms", false);
    CC.sfx && CC.sfx.play(r.ok ? "pass" : "fail");
    c.scrollTop = 0;
  }
  async function aiPolicy() {
    if (!S.course) return "";
    const r = await CC.api("/api/course?" + CC.q({ folder: S.course.folder }));
    const t = (r.files && r.files.profile && r.files.profile.text) || "";
    const m = t.match(/\*\*AI policy:\*\*\s*(.+)/);
    return m ? m[1].trim() : "";
  }
  function toggleAsk(explain) {
    const box = PG.askBox;
    if (!explain && !box.classList.contains("hidden")) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = "";
    const q = h("textarea", { rows: 2, placeholder: "Ask about your code - e.g. why does this print 0? what does static mean here?" });
    const answer = h("div", { class: "ask-answer md" });
    const go = h("button", { class: "btn primary sm", html: icon("send") + "<span>Ask</span>" });
    const hintOnly = h("input", { type: "checkbox" }); hintOnly.checked = CC.local.get("pg_hints", true);
    hintOnly.onchange = () => CC.local.set("pg_hints", hintOnly.checked);
    box.appendChild(h("div", { class: "row" }, h("b", { class: "small", text: "Ask AI about this code" }), h("span", { class: "spacer" }),
      h("label", { class: "tiny muted row", style: { gap: "4px" } }, hintOnly, "Hints, not answers"),
      btn("", "x", () => box.classList.add("hidden"), "ghost icon sm", "Close")));
    box.appendChild(q);
    box.appendChild(h("div", { class: "row" }, h("span", { class: "hint", text: "Uses your AI model. Never paste this into graded work." }), h("span", { class: "spacer" }), go));
    box.appendChild(answer);
    const ask = async () => {
      const question = q.value.trim() || (PG.last && !PG.last.result.ok ? "Explain this error and how to fix it." : "");
      if (!question) { q.focus(); return; }
      go.disabled = true; answer.innerHTML = '<span class="muted">Thinking...</span>';
      const policy = await aiPolicy();
      const L = CC.lang(PG.lang).label;
      const sys = "You are a patient programming tutor inside CodeCoach's " + L + " playground. The student is learning." +
        (hintOnly.checked ? " HINT MODE: explain what is wrong and why, point to the exact line, and give the smallest nudge. Do NOT write the corrected program or a full solution. A one-line syntax example in a different context is fine." :
          " Explain clearly. You may show the fix, but keep it minimal and explain each change.") +
        " Line numbers in errors refer to the student's code as shown (line 1 = first line)." +
        (policy ? " Course AI policy: " + policy + " - respect it." : "") + " Be concise: under 180 words unless asked for more. Use Markdown.";
      const numbered = PG.ed.get().split("\n").map((l, i) => String(i + 1).padStart(3) + "| " + l).join("\n");
      let ctx = "My code (" + L + "):\n```\n" + numbered + "\n```\n";
      if (PG.stdin.value.trim()) ctx += "Input:\n```\n" + PG.stdin.value.slice(0, 2000) + "\n```\n";
      if (PG.last && PG.last.code === PG.ed.get()) {
        const r = PG.last.result;
        ctx += "Last run " + (r.ok ? "succeeded" : "failed") + ".\n" + (r.stdout ? "Output:\n```\n" + r.stdout.slice(0, 3000) + "\n```\n" : "") + (r.stderr ? "Errors:\n```\n" + r.stderr.slice(0, 4000) + "\n```\n" : "");
      }
      const r = await CC.api("/api/llm", { messages: [{ role: "system", content: sys }, { role: "user", content: ctx + "\nQuestion: " + question }], max_tokens: 1500 });
      go.disabled = false;
      if (r.error) { answer.innerHTML = ""; answer.appendChild(h("span", { class: "err", text: r.error })); return; }
      MD.into(answer, (r.message && r.message.content) || "(no answer)");
      CC.usageLine();
    };
    go.onclick = ask;
    q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
    if (explain) ask(); else q.focus();
  }
  function snippetName() {
    let n = (PG.nameIn.value || "").trim().replace(/[\\/:*?"<>|]/g, "-");
    if (!n) return null;
    const ext = EXT[PG.lang];
    if (!new RegExp("\\." + ext + "$", "i").test(n)) n = n.replace(/\.\w+$/, "") + "." + ext;
    return n;
  }
  async function saveSnippet() {
    let n = snippetName();
    if (!n) {
      const v = await CC.prompt("Save snippet", "Name", "");
      if (!v) return;
      PG.nameIn.value = v; n = snippetName();
    }
    const r = await CC.api("/api/snippet/save", { name: n, code: PG.ed.get() });
    if (r.error) return CC.toast(r.error, true);
    PG.nameIn.value = r.name.replace(/\.\w+$/, "");
    saveDraftNow();
    const s = $("pgSaved"); if (s) s.textContent = "Saved to CodeCoach/snippets";
    CC.toast("Saved " + r.name + " (in your Library)");
  }
  async function openSnippets() {
    const r = await CC.api("/api/snippets");
    if (r.error) return CC.toast(r.error, true);
    const list = h("div", { class: "list" });
    const filt = h("input", { type: "search", placeholder: "Filter" });
    const draw = () => {
      list.innerHTML = "";
      const items = r.snippets.filter((s) => s.name.toLowerCase().includes(filt.value.toLowerCase())).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
      if (!items.length) list.appendChild(h("p", { class: "muted small", text: r.snippets.length ? "No match." : "No saved snippets yet. Name your code and press Cmd+S." }));
      items.forEach((s) => {
        const ext = (s.name.match(/\.(\w+)$/) || [])[1];
        list.appendChild(h("div", { class: "item" }, h("span", { class: "chip", text: (ext && CC.lang(EXT_LANG[ext]).label) || ext || "?" }),
          h("a", { href: "#", class: "t", text: s.name, onclick: async (e) => { e.preventDefault(); await loadSnippet(s.name); } }),
          h("span", { class: "tiny muted", text: CC.fmtTime(s.updated) }),
          btn("", "trash", async () => {
            if (!(await CC.confirm("Delete " + s.name + "?", "This can't be undone.", "Delete", true))) return openSnippets();
            await CC.api("/api/snippet/delete", { name: s.name }); CC.toast("Deleted"); openSnippets();
          }, "ghost icon sm danger", "Delete")));
      });
    };
    filt.oninput = draw; draw();
    CC.modal("Saved snippets", h("div", { class: "stack" }, filt, list), null);
  }
  async function loadSnippet(name) {
    const r = await CC.api("/api/snippet?" + CC.q({ name }));
    if (r.error) return CC.toast(r.error, true);
    CC.closeModal();
    saveDraftNow();
    const ext = (name.match(/\.(\w+)$/) || [])[1];
    const lang = EXT_LANG[ext] || PG.lang;
    if (lang !== PG.lang) { PG.lang = lang; PG.langSel.value = lang; CC.local.set("pg_lang", lang); PG.loadDraft(); }
    PG.ed.set(r.code); PG.nameIn.value = name.replace(/\.\w+$/, ""); saveDraftNow();
    CC.toast("Opened " + name);
  }
  async function newScratch() {
    if (PG.ed.get().trim() && !(await CC.confirm("Start a blank file?", "Your current code will be replaced (save it first with Cmd+S if you want it).", "New file"))) return;
    PG.ed.set(""); PG.nameIn.value = ""; PG.stdin.value = ""; saveDraftNow(); PG.ed.focus();
  }
  function downloadFile() {
    const name = snippetName() || (PG.lang === "java" ? "Main.java" : "main." + EXT[PG.lang]);
    const a = h("a", { href: URL.createObjectURL(new Blob([PG.ed.get()], { type: "text/plain" })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  CC.openInPlayground = function (code, lang) {
    CC.go("playground");
    if (lang && EXT[lang] && lang !== PG.lang) { saveDraftNow(); PG.lang = lang; PG.langSel.value = lang; PG.loadDraft(); }
    PG.ed.set(code); PG.nameIn.value = ""; saveDraftNow();
  };

  // ================================================================== PROGRESS
  const TABS = [["overview", "Overview"], ["roadmap", "Roadmap"], ["tracker", "Mastery"], ["toolkit", "Toolkit"], ["mistakes", "Mistakes"], ["patterns", "Patterns"], ["blueprint", "Blueprint"], ["profile", "Course profile"], ["learner", "Learner profile"]];
  const PR = { tab: CC.local.get("pr_tab", "overview"), data: null, editing: false };
  CC.views.progress = {
    async show() {
      const inner = page("view-progress");
      if (!S.course) return noCourse(inner);
      const r = await CC.api("/api/course?" + CC.q({ folder: S.course.folder }));
      if (r.error) { inner.appendChild(h("div", { class: "card", text: r.error })); return; }
      PR.data = r; PR.editing = false; PR.inner = inner;
      drawProgress();
    },
  };
  function drawProgress() {
    const inner = PR.inner, r = PR.data; inner.innerHTML = "";
    if (PR.tab !== "overview" && !r.files[PR.tab]) PR.tab = "overview";
    const f = r.files[PR.tab];
    const abs = f ? (f.path || S.course.folder + "/" + f.name) : S.course.folder + "/_course.md";
    inner.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", { text: "Progress & notes" }),
      h("div", { class: "sub", text: "Every tab is a plain Markdown file in your Library. Edit it here or in any editor - both stay in step." })),
      h("span", { class: "spacer" }),
      S.state.obsidian ? h("a", { class: "btn ghost", href: obsidianLink(abs), html: icon("external") + "<span>Obsidian</span>" }) : null,
      btn("Open file", "file", () => CC.api("/api/open", { path: abs }).then((x) => x.error && CC.toast(x.error, true)), "")));
    const tabs = h("div", { class: "tabs" });
    TABS.forEach(([k, label]) => {
      if (k !== "overview" && !r.files[k]) return;
      tabs.appendChild(h("button", { class: PR.tab === k ? "on" : "", text: label, onclick: () => { if (PR.editing && !confirm("Discard your unsaved edits?")) return; PR.tab = k; PR.editing = false; CC.local.set("pr_tab", k); drawProgress(); } }));
    });
    inner.appendChild(tabs);
    if (PR.tab === "overview") return drawOverview(inner);
    const card = h("div", { class: "card note-card" });
    inner.appendChild(card);
    const isLearner = !!f.learner;
    const shared = !!f.path && !isLearner;
    const head = h("div", { class: "row" }, h("span", { class: "chip", text: f.name }), shared || isLearner ? h("span", { class: "chip accent", text: isLearner ? "used by every course" : "shared with other courses" }) : null, h("span", { class: "spacer" }));
    card.appendChild(head);
    if (!PR.editing) {
      if (!shared) head.appendChild(btn("Edit", "edit", () => { PR.editing = true; drawProgress(); }, "sm"));
      const body = h("div", { class: "md" });
      MD.into(body, f.text);
      card.appendChild(body);
      if (PR.tab === "roadmap") wireRoadmap(body, f);
    } else {
      const ta = h("textarea", { class: "note-edit", spellcheck: "false" }); ta.value = f.text;
      const save = async () => {
        const res = isLearner ? await CC.api("/api/learner/write", { text: ta.value }) : await CC.api("/api/note/write", { folder: S.course.folder, name: f.name, text: ta.value });
        if (res.error) return CC.toast(res.error, true);
        f.text = ta.value; PR.editing = false; CC.toast("Saved " + f.name); drawProgress();
      };
      ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } if (e.key === "Escape") { e.stopPropagation(); } });
      head.appendChild(btn("Cancel", null, () => { PR.editing = false; drawProgress(); }, "sm ghost"));
      head.appendChild(btn("Save", "save", save, "sm primary"));
      card.appendChild(ta);
      card.appendChild(h("div", { class: "hint", text: "Cmd+S to save. Keep table rows on one line - CodeCoach reads these tables." }));
      setTimeout(() => ta.focus(), 30);
    }
  }
  function wireRoadmap(body, f) {
    // turn the rendered ☐/☑ into real checkboxes bound to the Nth "- [ ]" line
    const lines = f.text.split("\n");
    const idx = []; lines.forEach((l, i) => { if (/^\s*(>\s*)*([-*+]|\d+[.)])\s+\[( |x|X)\]\s/.test(l)) idx.push(i); });
    let n = 0;
    body.querySelectorAll("li").forEach((li) => {
      const first = li.firstChild;
      if (!first || first.nodeType !== 3 || !/^[☐☑] /.test(first.textContent)) return;
      const lineNo = idx[n++]; if (lineNo == null) return;
      const done = first.textContent[0] === "☑";
      first.textContent = first.textContent.slice(2);
      const cb = h("input", { type: "checkbox", class: "rm-check" }); cb.checked = done;
      if (done) li.classList.add("done");
      cb.onchange = async () => {
        lines[lineNo] = lines[lineNo].replace(/\[( |x|X)\]/, cb.checked ? "[x]" : "[ ]");
        f.text = lines.join("\n");
        li.classList.toggle("done", cb.checked);
        const res = await CC.api("/api/note/write", { folder: S.course.folder, name: f.name, text: f.text });
        if (res.error) CC.toast(res.error, true); else drawProgress();
      };
      li.insertBefore(cb, li.firstChild);
      const label = li.childNodes[1] && li.childNodes[1].nodeType === 3 ? li.childNodes[1].textContent.trim() : "";
      if (!done && label && !/^\(/.test(label)) {
        li.appendChild(h("button", { class: "btn ghost sm rm-go", html: icon("play") + "<span>Learn</span>", onclick: () => CC.go("study", { fresh: true, mode: "learn", topic: label }) }));
      }
    });
    const total = idx.length, doneN = idx.filter((i) => /\[(x|X)\]/.test(lines[i])).length;
    if (total) body.prepend(h("div", { class: "rm-progress" }, h("div", { class: "bar done" }, h("span", { style: { width: Math.round(doneN / total * 100) + "%" } })),
      h("span", { class: "tiny muted", text: doneN + " of " + total + " done" })));
  }
  async function drawOverview(inner) {
    const d = await CC.api("/api/dashboard?" + CC.q({ folder: S.course.folder }));
    const ss = await CC.api("/api/sessions?" + CC.q({ folder: S.course.folder }));
    if (d.error) return inner.appendChild(h("div", { class: "card", text: d.error }));
    const grid = h("div", { class: "today-grid" });
    inner.appendChild(grid);
    const topics = h("div", { class: "card" }, h("h3", { html: icon("target") + "All topics" }));
    if (d.topics.length) {
      const list = h("div", { class: "bars" });
      d.topics.forEach((t) => {
        const n = levelNum(t.level), done = /yes/i.test(t.mastered);
        list.appendChild(h("div", { class: "bar-row clickable", title: "Next review: " + (t.next || "-") + " - click to practice", onclick: () => CC.go("study", { fresh: true, mode: t.due ? "review" : "learn", topic: t.topic }) },
          h("span", { class: "name", text: (t.due && !done ? "● " : "") + t.topic }),
          h("div", { class: "bar" + (done ? " done" : "") }, h("span", { style: { width: (done ? 100 : Math.round(n / 6 * 100)) + "%" } })),
          h("span", { class: "lv", text: done ? "done" : "R" + n })));
      });
      topics.appendChild(list);
      topics.appendChild(h("p", { class: "hint", style: { marginBottom: 0 }, text: "R0 syntax · R1 trace · R2 fill-in · R3 modify · R4 guided · R5 from scratch · R6 timed. ● = review due." }));
    } else topics.appendChild(h("p", { class: "muted small", text: "No topics yet - they're added as you study." }));
    grid.appendChild(topics);
    const right = h("div", { class: "stack" });
    grid.appendChild(right);
    right.appendChild(h("div", { class: "card" }, h("h3", { html: icon("bolt") + "Toolkit" }),
      h("p", { class: "small", style: { margin: 0 }, text: d.toolkit.total ? d.toolkit.solid + " of " + d.toolkit.total + " syntax lines solid · " + d.toolkit.weak + " to drill" : "Empty - syntax drills fill it in." }),
      d.toolkit.total ? h("div", { class: "bar done", style: { marginTop: "8px" } }, h("span", { style: { width: Math.round(d.toolkit.solid / Math.max(1, d.toolkit.total) * 100) + "%" } })) : null));
    const sc = h("div", { class: "card" }, h("h3", { html: icon("chat") + "All sessions" }));
    const sessions = (ss.sessions || []);
    if (!sessions.length) sc.appendChild(h("p", { class: "muted small", text: "None yet." }));
    const list = h("div", { class: "list" });
    sessions.forEach((s) => list.appendChild(h("div", { class: "item" }, h("span", { class: "chip", text: s.mode || "learn" }), h("span", { class: "t", text: s.title || "Session" }),
      h("span", { class: "tiny muted", text: CC.fmtTime(s.updated) }),
      btn("", "arrow", () => { CC.go("study"); CC.resumeSession(s.id); }, "ghost icon sm", "Resume"),
      btn("", "trash", async () => {
        if (S.session && S.session.id === s.id) return CC.toast("That session is open - close it in Study first, then delete it.", true);
        if (!(await CC.confirm("Delete this session?", "It moves to CodeCoach/trash. Your notes and tracker are kept.", "Delete", true))) return;
        await CC.api("/api/session/delete", { id: s.id }); CC.local.set("draft_" + s.id, null); CC.toast("Session deleted"); drawProgress();
      }, "ghost icon sm danger", "Delete"))));
    sc.appendChild(list);
    right.appendChild(sc);
  }


  // ================================================================== HOW TO USE (in-app guide)
  const G = { text: null, q: "" };
  CC.views.guide = {
    async show(opts) {
      const v = $("view-guide");
      if (G.text == null) {
        try { G.text = await (await fetch("/static/guide.md", { cache: "no-store" })).text(); } catch (e) { G.text = "# How to use CodeCoach\n\nCouldn't load the guide."; }
      }
      v.innerHTML = "";
      const parts = G.text.split(/\n(?=## )/);
      const intro = parts.shift();
      const secs = parts.map((t, i) => ({ id: "g" + i, title: t.split("\n")[0].replace(/^##\s*/, "").trim(), text: t }));
      const toc = h("nav", { class: "guide-toc" });
      const body = h("div", { class: "guide-body" });
      const search = h("input", { type: "search", placeholder: "Search the guide (e.g. pause, parsons, sync)", value: G.q });
      const count = h("div", { class: "hint" });
      const draw = () => {
        const q = G.q.trim().toLowerCase();
        toc.innerHTML = ""; body.innerHTML = "";
        if (!q) body.appendChild(MD.into(h("div", { class: "md guide-intro" }), intro));
        let shown = 0;
        secs.forEach((s) => {
          if (q && !s.text.toLowerCase().includes(q)) return;
          shown++;
          const el = MD.into(h("section", { class: "md guide-sec card", id: s.id }), s.text);
          if (q) el.querySelectorAll("p, li, td, h2, h3").forEach((n) => { if (n.textContent.toLowerCase().includes(q)) n.classList.add("guide-hit"); });
          body.appendChild(el);
          toc.appendChild(h("a", { href: "#", text: s.title, onclick: (e) => { e.preventDefault(); const t = document.getElementById(s.id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); } }));
        });
        count.textContent = q ? shown + " section" + (shown === 1 ? "" : "s") + " match" : "";
        if (q && !shown) body.appendChild(h("div", { class: "empty" }, h("h3", { text: "Nothing found" }), h("p", { text: "Try another word." })));
      };
      search.oninput = CC.debounce(() => { G.q = search.value; draw(); }, 150);
      const inner = h("div", { class: "page-inner guide" },
        h("div", { class: "page-head" }, h("div", null, h("h1", { text: "How to use" }), h("div", { class: "sub", text: "everything CodeCoach does, how to use it, and why it works" })),
          h("span", { class: "spacer" }), search),
        h("div", { class: "guide-grid" }, h("div", { class: "guide-side" }, count, toc), body));
      v.appendChild(h("div", { class: "page" }, inner));
      draw();
      if (opts && opts.section) { const s = secs.find((x) => x.title.toLowerCase().startsWith(opts.section.toLowerCase())); if (s) setTimeout(() => document.getElementById(s.id).scrollIntoView({ block: "start" }), 50); }
    },
  };

  // ================================================================== WELCOME (the in-app landing page)
  const AI_EXAMPLES = [
    ["openrouter", "OpenRouter", "Cloud · hundreds of models · pay per use (some free)", "openrouter:deepseek/deepseek-v4.1-flash"],
    ["ollama", "Ollama", "Free · private · runs on this computer", "ollama:qwen3:14b"],
    ["lmstudio", "LM Studio", "Free · private · runs on this computer", "lmstudio:qwen/qwen3-14b"],
    ["custom", "Anything else", "Any OpenAI-compatible server, today or in the future", "my-model@https://their-server.example/v1"],
  ];
  CC.useAI = async function (line, label) {
    const r = await CC.api("/api/config", { ai: line });
    if (r.error) return CC.toast(r.error, true);
    CC.rememberAI(line);
    await CC.refreshState();
    CC.usageLine();
    if (S.session) S.sys = null;
    if (!S.state.has_key && !(S.state.ai || {}).local) CC.views.settings("Paste your " + S.state.ai.label + " API key to finish switching.", "ai");
    else CC.toast("AI: " + (label || CC.aiLabel(line)));
    if (CC.views.welcome && S.view === "welcome") CC.views.welcome.show();
  };
  async function buildInfo() {
    try { const r = await fetch("/static/build.json", { cache: "no-store" }); if (r.ok) return await r.json(); } catch (e) { /* source install */ }
    return {};
  }
  CC.views.welcome = {
    async show() {
      const v = $("view-welcome"), st = S.state, ai = st.ai || {};
      const info = await buildInfo();
      v.innerHTML = "";
      const tree = "CodeCoach Library/\n" +
        "├─ README - CodeCoach Library.md\n" +
        "├─ Courses/\n" +
        "│  └─ CS 124/\n" +
        "│     ├─ _course.md            course profile\n" +
        "│     ├─ Roadmap.md · Mastery Tracker.md · Mistakes.md ...\n" +
        "│     ├─ materials/            your class content\n" +
        "│     ├─ practice/             every solution you wrote\n" +
        "│     └─ sessions/             a readable log of each session\n" +
        "└─ CodeCoach/                  saved sessions, snippets, learner profile";
      const hero = h("div", { class: "wl-hero" },
        h("div", { class: "wl-kicker", text: "❯ codecoach " + (st.version || "") }),
        h("h1", { text: "Learn to code with a coach that teaches, drills and remembers." }),
        h("p", { class: "wl-lead", text: "Free, open, and it runs on your computer. No account. Your notes are plain files you own, and you pick the AI." }),
        h("div", { class: "row wrap" },
          btn("Start studying", "play", () => CC.go(S.course ? "study" : "today"), "primary"),
          btn("How to use", "help", () => CC.go("guide"), ""),
          !st.courses || !st.courses.length ? btn("Create your first course", "plus", () => CC.views.newCourse(), "") : null));
      // ---- Your data stays yours.
      const data = h("section", { class: "wl-sec" },
        h("h2", { text: "Your data stays yours." }),
        h("p", { class: "wl-lead", html: "All your notes, solutions and progress live in a plain folder on your computer:<br><code class='wl-path'>" + MD.esc(st.library || "") + "</code>" }),
        h("div", { class: "wl-cards" },
          h("div", { class: "card wl-card" }, h("h3", { html: icon("file") + "Plain files, forever" }),
            h("p", { text: "Everything is Markdown. Read or edit it in any text editor - TextEdit, Notepad, VS Code, or open the folder as an Obsidian vault. If CodeCoach disappeared tomorrow, your work would still be right there." })),
          h("div", { class: "card wl-card" }, h("h3", { html: icon("refresh") + "Sync with what you already use" }),
            h("p", { text: "Put the folder in iCloud Drive, Dropbox, OneDrive or Google Drive, or track it with Git or Syncthing. Point CodeCoach on your other computer at the same folder - done. Free, and no account with us." })),
          h("div", { class: "card wl-card" }, h("h3", { html: icon("download") + "Take it anywhere" }),
            h("p", { text: "Export everything into a single zip whenever you like. API keys stay on this computer only - never in your Library, never in exports. No tracking, no telemetry." }))),
        h("div", { class: "row wrap" },
          btn("Export everything", "download", () => CC.exportAll(), "primary"),
          btn("Show in " + CC.fileManager(), "folder", () => CC.api("/api/reveal", { what: "library" }), ""),
          btn("Change folder", "edit", () => CC.views.settings(null, "sync"), "ghost")),
        h("details", { class: "wl-tree" }, h("summary", { text: "What's inside the folder" }), h("pre", { text: tree })));
      // ---- Bring your own model
      const exRows = AI_EXAMPLES.map(([id, label, sub, line]) => {
        const on = id === ai.id;
        return h("div", { class: "wl-ai" + (on ? " on" : "") },
          h("div", { class: "wl-ai-head" }, h("b", { text: label }), on ? h("span", { class: "chip good", text: "in use" }) : null),
          h("div", { class: "hint", text: sub }),
          h("code", { class: "wl-line", text: '"ai": "' + (on ? ai.line : line) + '"' }),
          id === "custom" ? btn("Set up...", "gear", () => CC.views.settings(null, "ai"), "sm ghost") : on ? null : btn("Use " + label, "arrow", () => CC.useAI(line, label), "sm"));
      });
      const models = h("section", { class: "wl-sec" },
        h("h2", { text: "Bring your own model." }),
        h("p", { class: "wl-lead", html: "CodeCoach works with any AI that speaks the OpenAI chat format. Swapping is <b>one line of config</b> - <code>provider:model</code>, or <code>model@server-url</code> for anything else." }),
        h("div", { class: "wl-ai-grid" }, ...exRows),
        h("div", { class: "card soft" },
          h("div", { class: "row wrap" }, h("span", { class: "small", html: "Now using <b>" + MD.esc(CC.aiLabel(ai.line || "")) + "</b>" + (ai.local ? " · free and private" : "") }), h("span", { class: "spacer" }),
            btn("Change AI", "spark", () => CC.views.settings(null, "ai"), "sm"), btn("Show settings file", "folder", () => CC.api("/api/reveal", { what: "settings" }), "sm ghost")),
          h("pre", { class: "wl-config", text: "// ~/.codecoach/config.json  (this computer only)\n{\n  \"ai\": \"" + (ai.line || "ollama:qwen3:14b") + "\",\n  \"keys\": { \"openrouter\": \"sk-or-...\" }\n}" }),
          h("p", { class: "hint", style: { margin: "6px 0 0" }, html: "Also built in: <code>openai:</code> <code>anthropic:</code> <code>gemini:</code> <code>groq:</code> <code>deepseek:</code> <code>mistral:</code>. A brand-new provider needs no update - use <code>model@https://their-api/v1</code>, or add it once under <code>\"providers\"</code> in config.json." })));
      // ---- get it everywhere
      const repo = info.repo ? "https://github.com/" + info.repo : "";
      const get = h("section", { class: "wl-sec" },
        h("h2", { text: "On all your computers." }),
        h("p", { class: "wl-lead", text: "CodeCoach runs on macOS, Windows and Linux. Install it on each computer, point it at the same synced Library, and pick up exactly where you left off." }),
        repo ? h("div", { class: "row wrap" },
          h("a", { class: "btn", href: repo + "/releases/latest", target: "_blank", rel: "noopener", html: icon("download") + "<span>Downloads</span>" }),
          h("a", { class: "btn ghost", href: repo, target: "_blank", rel: "noopener", html: icon("external") + "<span>Source code</span>" }))
          : h("p", { class: "hint", text: "Get the installer for your other computers from the same place you downloaded CodeCoach." }));
      v.appendChild(h("div", { class: "page" }, h("div", { class: "page-inner welcome" }, hero, data, models, get)));
    },
  };

  // ================================================================== FIRST-RUN SETUP
  CC.views.setup = function () {
    const st = S.state;
    let lib = st.vault_exists ? st.library : st.default_library;
    const path = h("code", { class: "wl-path", text: lib });
    const choose = async (prompt) => { const f = await CC.pickFolder(prompt, lib); if (f) { lib = f; path.textContent = f; } };
    const ai = CC.aiPicker(st, { line: (st.ai && st.ai.line) || "openrouter:deepseek/deepseek-v4.1-flash" });
    const body = h("div", { class: "stack setup" },
      h("p", { class: "wl-lead", style: { margin: 0 }, text: "Two quick choices and you're in. You can change both later in Settings." }),
      h("div", { class: "section-title", text: "1 · Where your data lives" }),
      h("p", { class: "small", style: { margin: 0 }, text: "Your notes, solutions and progress are plain Markdown files in one folder - your Library. Put it in iCloud Drive, Dropbox or a Git repo to sync it between computers for free." }),
      h("div", { class: "row wrap" }, path),
      h("div", { class: "row wrap" },
        btn("Choose a folder...", "folder", () => choose("Choose (or create) a folder for your CodeCoach Library"), "sm"),
        btn("Use my Obsidian vault", "book", () => choose("Choose your Obsidian vault"), "sm ghost"),
        btn("Use the default", "refresh", () => { lib = st.default_library; path.textContent = lib; }, "sm ghost")),
      h("div", { class: "section-title", text: "2 · Bring your own model" }),
      ai.el);
    const start = async () => {
      const r = await CC.api("/api/library/use", { path: lib });
      if (r.error) return CC.toast(r.error, true);
      const b = { ai: ai.line() };
      if (ai.keys()) b.keys = ai.keys();
      if (!ai.problem()) { await CC.api("/api/config", b); CC.rememberAI(b.ai); }
      CC.closeModal();
      await CC.refreshState();
      CC.go("welcome");
      if (!S.state.has_key) CC.toast("You can finish setting up the AI any time in Settings > AI & coach.");
      if (!(S.state.courses || []).length) setTimeout(() => CC.views.newCourse(), 400);
    };
    CC.modal("Welcome to CodeCoach", body, [h("span", { class: "hint", text: "Free · no account · your files stay on your computer" }), h("span", { class: "spacer" }),
      btn("Start", "arrow", start, "primary")], { wide: true, sticky: true, noFocus: true });
  };

  // ================================================================== AI PICKER (Settings + first-run setup)
  // One line of config picks the AI:  "provider:model"  or  "model@https://any-openai-compatible-server/v1"
  CC.parseAI = function (line) {
    line = String(line || "").trim();
    const provs = (S.state.providers || []);
    const m = line.match(/^(.*)@(https?:\/\/\S+)$/);
    if (m) return { id: "custom", model: m[1].trim(), url: m[2].replace(/\/+$/, "") };
    const i = line.indexOf(":"), pid = i > 0 ? line.slice(0, i).toLowerCase() : "";
    if (pid && provs.find((p) => p.id === pid)) return { id: pid, model: line.slice(i + 1).trim(), url: "" };
    return { id: "openrouter", model: line, url: "" };
  };
  CC.aiLine = (id, model, url) => (id === "custom" ? (model || "") + "@" + (url || "http://localhost:8080/v1") : id + ":" + (model || ""));
  CC.aiLabel = function (line) {
    const a = CC.parseAI(line), p = (S.state.providers || []).find((x) => x.id === a.id);
    const short = (a.model || "no model").split("/").pop();
    return short + " · " + (a.id === "custom" ? (a.url || "").replace(/^https?:\/\//, "").replace(/\/v1$/, "") : p ? p.label : a.id);
  };
  const SUGGEST = {
    openrouter: () => CC.MODELS.map((m) => m[0]),
    ollama: () => ["qwen3:14b", "qwen3:8b", "llama3.1:8b", "mistral-small3.2", "gpt-oss:20b"],
    lmstudio: () => ["qwen/qwen3-14b", "openai/gpt-oss-20b"],
    openai: () => ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"],
    anthropic: () => ["claude-sonnet-4-5", "claude-haiku-4-5"],
    gemini: () => ["gemini-2.5-flash", "gemini-2.5-pro"],
    groq: () => ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    deepseek: () => ["deepseek-chat"],
    mistral: () => ["mistral-medium-latest", "mistral-small-latest"],
  };
  function aiPicker(st, opts) {
    opts = opts || {};
    const provs = (st.providers || []).concat([{ id: "custom", label: "Any other server (OpenAI-compatible URL)", local: false, key_url: "" }]);
    let cur = CC.parseAI(opts.line || (st.ai && st.ai.line) || "");
    const provSel = h("select", null, ...provs.map((p) => h("option", { value: p.id, text: p.label + (p.local ? " - free, runs on this computer" : "") })));
    const listId = "aiModels" + Math.random().toString(36).slice(2, 7);
    const dl = h("datalist", { id: listId });
    const model = h("input", { type: "text", list: listId, spellcheck: "false", placeholder: "model name" });
    const url = h("input", { type: "text", spellcheck: "false", placeholder: "https://your-server/v1" });
    const key = h("input", { type: "password", autocomplete: "off" });
    const keyHint = h("div", { class: "hint" });
    const status = h("span", { class: "hint" });
    const lineIn = h("input", { type: "text", class: "ai-line", spellcheck: "false" });
    const urlField = h("div", { class: "field" }, h("label", { text: "Server address" }), url);
    const keyField = h("div", { class: "field" }, h("label", { text: "API key" }), key, keyHint);
    const localHelp = h("p", { class: "hint", style: { margin: 0 } });
    const fill = (list) => { dl.innerHTML = ""; list.forEach((m) => dl.appendChild(h("option", { value: m }))); };
    const prov = () => provs.find((p) => p.id === provSel.value) || provs[0];
    const line = () => CC.aiLine(provSel.value, model.value.trim(), url.value.trim());
    const sync = (fromLine) => {
      if (fromLine) { cur = CC.parseAI(lineIn.value); provSel.value = cur.id; model.value = cur.model; if (cur.id === "custom") url.value = cur.url; }
      const p = prov();
      urlField.classList.toggle("hidden", p.id !== "custom");
      keyField.classList.toggle("hidden", !!p.local);
      key.placeholder = p.has_key ? "Saved on this computer - paste a new one to replace" : p.id === "custom" ? "Only if your server needs one" : "Paste your " + p.label + " key";
      keyHint.innerHTML = p.key_url ? 'Stays on this computer (~/.codecoach/config.json), never in your Library or exports. <a href="' + p.key_url + '" target="_blank" rel="noopener">Get a key from ' + MD.esc(p.label) + "</a>" +
        (p.key_env ? " · or set <code>" + p.key_env + "</code>" : "") : "Stays on this computer, never in your Library or exports.";
      localHelp.classList.toggle("hidden", !p.local);
      localHelp.innerHTML = p.id === "ollama" ? 'Free and private. Install <a href="https://ollama.com/download" target="_blank" rel="noopener">Ollama</a>, run <code>ollama pull qwen3:14b</code>, keep Ollama open, then press <b>Find models</b>. Pick a model that supports <b>tools</b>, with at least a 32k context.'
        : p.id === "lmstudio" ? 'Free and private. In <a href="https://lmstudio.ai" target="_blank" rel="noopener">LM Studio</a>: download a model that supports tools (e.g. Qwen 3), open the Developer tab and <b>Start Server</b>, then press <b>Find models</b>. Set context length to 32k+.'
        : "Runs on your own computer.";
      if (!fromLine) lineIn.value = '"ai": "' + line() + '"';
      else lineIn.value = '"ai": "' + line() + '"';
      fill((SUGGEST[p.id] || (() => []))());
    };
    lineIn.addEventListener("change", () => { lineIn.value = lineIn.value.replace(/^\s*"ai"\s*:\s*/, "").replace(/^"|",?\s*$/g, ""); sync(true); });
    provSel.onchange = () => { model.value = ""; status.textContent = ""; sync(false); };
    model.oninput = url.oninput = () => sync(false);
    const find = async () => {
      status.textContent = "Looking..."; status.style.color = "";
      if (key.value.trim()) await CC.api("/api/config", { keys: { [provSel.value]: key.value.trim() } });
      const r = await CC.api("/api/models?" + CC.q({ ai: line() }));
      if (!r.ok) { status.textContent = r.error || "Not reachable"; status.style.color = "var(--bad)"; return; }
      fill(r.models);
      if (!model.value && r.models.length) { model.value = r.models[0]; sync(false); }
      status.textContent = "Connected · " + r.models.length + " model" + (r.models.length === 1 ? "" : "s") + " - type to search"; status.style.color = "var(--good)";
    };
    const copy = h("button", { class: "btn sm ghost", text: "Copy", onclick: () => navigator.clipboard.writeText(lineIn.value).then(() => CC.toast("Copied")) });
    provSel.value = cur.id; model.value = cur.model; url.value = cur.url || "";
    const el = h("div", { class: "stack" },
      h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", { text: "Provider" }), provSel),
        h("div", { class: "field" }, h("label", { text: "Model" }), h("div", { class: "row" }, model, dl, h("button", { class: "btn sm", html: CC.icon("refresh") + "<span>Find models</span>", onclick: find })), status)),
      localHelp, urlField, keyField,
      h("div", { class: "field" }, h("label", { text: "As one line of config" }), h("div", { class: "row" }, lineIn, copy),
        h("div", { class: "hint", html: "This is all CodeCoach stores to pick your AI. Paste a line here to switch, e.g. <code>ollama:qwen3:14b</code>, <code>openrouter:moonshotai/kimi-k3</code> or <code>my-model@http://192.168.1.20:8080/v1</code>." })));
    sync(false);
    return {
      el,
      line: () => line(),
      keys: () => (key.value.trim() ? { [provSel.value]: key.value.trim() } : null),
      problem: () => (!model.value.trim() ? "Pick or type a model first (press Find models)." : provSel.value === "custom" && !/^https?:\/\//.test(url.value.trim()) ? "Enter the server address (starting with http)." : ""),
    };
  }
  CC.aiPicker = aiPicker;

  // ================================================================== SETTINGS
  CC.views.settings = function (msg, openTab) {
    const st = S.state, cfg = st.config || {};
    const maxTok = h("input", { type: "number", min: 1000, max: 64000, step: 500, value: cfg.max_tokens || 8000 });
    const compact = h("input", { type: "number", min: 10000, max: 400000, step: 5000, value: cfg.compact_at || 40000 });
    const vault = h("input", { type: "text", value: cfg.vault || "", placeholder: st.default_library || "~/CodeCoach Library" });
    const syncD = h("input", { type: "text", value: cfg.sync_dir || "", placeholder: "Default: <Library>/CodeCoach" });
    const teach = h("input", { type: "text", value: cfg.teach_skill_path || "", placeholder: "Optional - leave empty for the built-in method" });
    const quitMin = h("input", { type: "number", min: 0, max: 600, value: cfg.auto_quit_minutes == null ? 20 : cfg.auto_quit_minutes });
    const updChk = h("input", { type: "checkbox" }); updChk.checked = cfg.check_updates !== false;
    const coachName = h("input", { type: "text", maxlength: 40, value: cfg.coach_name || "Coach", placeholder: "Coach" });
    const ai = aiPicker(st);
    const p = CC.prefs;
    const seg = (opts, cur, onpick) => {
      const s = h("div", { class: "seg" });
      opts.forEach(([v, label]) => s.appendChild(h("button", { class: String(cur) === String(v) ? "on" : "", text: label, onclick: () => { s.querySelectorAll("button").forEach((b) => b.classList.remove("on")); s.querySelector("[data-v='" + v + "']").classList.add("on"); onpick(v); }, "data-v": v })));
      return s;
    };
    const cur = CC.currentTheme();
    const themeBtn = h("button", { class: "btn theme-current", onclick: () => CC.views.themes() },
      themeChip(cur), h("span", { text: (p.theme && p.theme !== "system" ? cur.name : "Follow system (" + cur.name + ")") }), h("span", { class: "spacer" }), h("span", { class: "tiny muted", text: CCThemes.THEMES.length + " themes" }));
    const sw = h("div", { class: "swatches" });
    const accentPick = (name) => { p.accent = name; CC.savePrefs(); sw.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.a === name)); };
    sw.appendChild(h("button", { class: "theme-default" + (!p.accent || p.accent === "theme" ? " on" : ""), "data-a": "theme", title: "Theme's own accent", style: { background: cur.accent }, onclick: () => accentPick("theme") }));
    Object.entries(CC.ACCENTS).forEach(([name, col]) => sw.appendChild(h("button", { class: p.accent === name ? "on" : "", "data-a": name, title: name, style: { background: col }, onclick: () => accentPick(name) })));
    const MONOS = [["", "JetBrains Mono / SF Mono"], ['"SF Mono", ui-monospace, Menlo, monospace', "SF Mono"], ["Menlo, monospace", "Menlo"], ['"Fira Code", "Fira Mono", Menlo, monospace', "Fira Code"],
      ['"Cascadia Code", Consolas, Menlo, monospace', "Cascadia Code"], ['"IBM Plex Mono", Menlo, monospace', "IBM Plex Mono"], ['"Courier New", Courier, monospace', "Courier"]];
    const monoSel = h("select", null, ...MONOS.map(([v, l]) => h("option", { value: v, text: l })));
    monoSel.value = p.mono || ""; monoSel.onchange = () => { p.mono = monoSel.value; CC.savePrefs(); };
    // ---- sound & effects (saved instantly, per computer)
    const snd = p.sound = Object.assign({}, CC.soundDefaults, p.sound || {});
    const saveSnd = () => { CC.savePrefs(); CC.updateMuteBtn && CC.updateMuteBtn(); };
    const chk = (key, label, onchange) => { const c = h("input", { type: "checkbox" }); c.checked = !!snd[key]; c.onchange = () => { snd[key] = c.checked; saveSnd(); onchange && onchange(); }; return h("label", { class: "row small", style: { gap: "6px" } }, c, label); };
    const slider = (key) => { const r = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: snd[key] }); r.oninput = () => { snd[key] = +r.value; saveSnd(); }; return r; };
    const keySel = h("select", null, h("option", { value: "off", text: "Off" }), ...Object.entries(CC.KEY_PROFILES || {}).map(([k, l]) => h("option", { value: k, text: l })));
    keySel.value = snd.keys; keySel.onchange = () => { snd.keys = keySel.value; saveSnd(); if (snd.keys !== "off") CC.sfx.previewKeys(snd.keys); };
    const packSel = h("select", null, ...Object.entries(CC.FX_PACKS || {}).map(([k, l]) => h("option", { value: k, text: l })));
    packSel.value = snd.pack; packSel.onchange = () => { snd.pack = packSel.value; saveSnd(); CC.sfx.play("solve", true); };
    const fxTry = h("div", { class: "fx-try" }, ...Object.entries(CC.FX_LIST || {}).map(([k, l]) => h("button", { class: "btn sm ghost", text: "▸ " + l, onclick: () => CC.sfx.play(k, true) })));
    const soundBox = () => h("div", { class: "stack" },
      h("div", { class: "grid2" }, field("Everything", h("div", { class: "row" }, chk("muted", "Mute all sounds"), h("span", { class: "spacer" }))), field("Master volume", slider("volume"))),
      h("div", { class: "grid2" },
        field("Typing sound", h("div", { class: "stack", style: { gap: "6px" } }, h("div", { class: "row" }, keySel, h("button", { class: "btn sm", text: "Try", onclick: () => CC.sfx.previewKeys(snd.keys === "off" ? "creamy" : snd.keys) })),
          h("div", { class: "row wrap", style: { gap: "14px" } }, chk("keysCode", "When writing code"), chk("keysText", "In chat & text boxes"))), "Plays only on real key presses; held-down keys don't repeat."),
        field("Typing volume", slider("keysVolume"))),
      h("div", { class: "grid2" },
        field("Effect sounds", h("div", { class: "stack", style: { gap: "6px" } }, packSel,
          h("div", { class: "row wrap", style: { gap: "14px" } }, chk("feedback", "Right / wrong & tests"), chk("coach", "Coach replied"), chk("timers", "Timers & pause"), chk("clicks", "Button clicks")))),
        field("Effects volume", slider("fxVolume"))),
      field("Hear them", fxTry),
      chk("celebrate", "Small celebration (sparks) when you solve a problem or master a topic"));
    const uiSize = seg([[13.5, "Compact"], [14.5, "Default"], [16, "Large"]], p.uiSize || 14.5, (v) => { p.uiSize = +v; CC.savePrefs(); });
    const edSize = h("input", { type: "range", min: 11, max: 22, step: 1, value: p.editorSize || 14 });
    const edLbl = h("span", { class: "tiny muted", text: (p.editorSize || 14) + "px" });
    edSize.oninput = () => { p.editorSize = +edSize.value; edLbl.textContent = edSize.value + "px"; CC.savePrefs(); };

    const langRows = h("div", { class: "lang-grid" });
    const WIN = st.platform === "win32";
    const HOW = WIN
      ? { java: "Install Temurin JDK from adoptium.net (tick \"Set PATH\")", python: "Install Python from python.org", cpp: "Install MSYS2 or MinGW-w64 (g++) and add it to PATH", c: "Install MSYS2 or MinGW-w64 (gcc) and add it to PATH", javascript: "Install Node.js (nodejs.org)", go: "Install Go (go.dev/dl)", rust: "Install Rust (rustup.rs)" }
      : { java: "Install Temurin JDK (adoptium.net)", python: "Comes with macOS developer tools", cpp: "xcode-select --install", c: "xcode-select --install", javascript: "Install Node.js (nodejs.org)", go: "Install Go (go.dev/dl)", rust: "Install Rust (rustup.rs)" };
    Object.entries(st.languages || {}).forEach(([k, L]) => langRows.appendChild(h("div", { class: "item" },
      h("span", { class: "dot " + (L.available ? "good" : "bad") }), h("b", { text: L.label }),
      h("span", { class: "tiny muted", text: L.available ? (L.tests ? "ready · tests + playground" : "ready · playground") : HOW[k] || "not installed" }))));

    const field = (label, input, hint) => h("div", { class: "field" }, h("label", { text: label }), input, hint ? h("div", { class: "hint", html: hint }) : null);
    // ---- tabbed layout: a short page per topic instead of one long scroll
    const pane = (...kids) => h("div", { class: "stack set-pane" }, ...kids);
    const TABS = [
      ["ai", "AI & coach", "brain", pane(
        field("Your coach's name", coachName, "Shown in the chat and used by the AI, e.g. \"Ada\", \"Sensei\", \"Byte\"."),
        h("div", { class: "section-title", text: "Bring your own model" }),
        ai.el,
        field("Max reply length (tokens)", maxTok, "8000 is plenty. Very high values can cause 402 errors on paid providers."),
        field("Summarize long sessions after (tokens)", compact, "Older messages get condensed so long sessions stay fast and cheap."),
        field("Custom teaching method (optional)", teach, cfg.teach_skill_path ? (st.teach_found ? "Found - sessions use this method." : "<span style='color:var(--bad)'>File not found</span> - using the built-in method.") : "A Markdown file describing how you want to be taught. Empty = CodeCoach's built-in, research-based method."))],
      ["sync", "Library & sync", "folder", pane(
        field("Library folder", h("div", { class: "row" }, vault, h("button", { class: "btn sm", text: "Choose...", onclick: async () => { const f = await CC.pickFolder("Choose your CodeCoach Library folder", vault.value); if (f) vault.value = f; } })),
          (st.vault_exists ? "Found · " + (st.courses || []).length + " course" + ((st.courses || []).length === 1 ? "" : "s") + ". " : "<span style='color:var(--bad)'>Folder not found</span> - it will be created when you save. ") +
          "Every note, solution and bit of progress lives here as plain Markdown. Any folder works - including an Obsidian vault."),
        h("div", { class: "row wrap" }, btn("Show in " + CC.fileManager(), "folder", () => CC.api("/api/reveal", { what: "library" }), "sm"), btn("Export everything (.zip)", "download", () => CC.exportAll(), "sm")),
        h("div", { class: "card soft" }, h("h3", { html: icon("refresh") + "Sync with your other computers - free, no account" }),
          h("ol", { class: "small", style: { margin: "0", paddingLeft: "18px" } },
            h("li", { html: "Put the Library folder somewhere that already syncs: <b>iCloud Drive</b>, <b>Dropbox</b>, <b>OneDrive</b>, <b>Google Drive</b>, a <b>Git</b> repo or <b>Syncthing</b>." }),
            h("li", { html: "Install CodeCoach on the other computer and choose the same folder here." }),
            h("li", { html: "Add your AI key there too - keys are per computer and never sync." })),
          h("p", { class: "hint", style: { margin: "8px 0 0" }, text: "Sessions, progress, materials and snippets follow you. Avoid having the same session open on two computers at once." })),
        field("Advanced: separate data folder (sessions, snippets, usage)", syncD, "Leave empty to keep it inside the Library (<code>CodeCoach/</code>), so it syncs with everything else."))],
      ["look", "Appearance", "palette", pane(
        field("Theme", themeBtn, "Browse " + CCThemes.THEMES.length + " themes (including fun ones) with live preview (Shift+Cmd+K). Colors are tuned so text always stays readable."),
        h("div", { class: "grid2" }, field("Accent color", sw, "The first dot keeps the theme's own accent."), field("Text size", uiSize)),
        h("div", { class: "grid2" }, field("Editor font", monoSel), field("Editor font size", h("div", { class: "row" }, edSize, edLbl))),
        h("p", { class: "hint", style: { margin: 0 }, text: "Appearance changes apply instantly and are saved on this computer." }))],
      ["sound", "Sound & effects", "volume", pane(soundBox())],
      ["langs", "Languages", "code", pane(h("p", { class: "hint", style: { margin: 0 }, text: "What can run on this computer. Install a missing one, then restart CodeCoach." }), langRows)],
      ["app", "App & shortcuts", "keyboard", pane(
        h("div", { class: "grid2" }, field("Quit automatically when the window has been closed for (minutes)", quitMin, "0 = never."),
          h("div", { class: "field" }, h("label", { text: "CodeCoach " + (st.version || "") }), h("div", { class: "row" }, h("button", { class: "btn sm", html: CC.icon("help") + "<span>Open the How to use guide</span>", onclick: () => { CC.closeModal(); CC.go("guide"); } })))),
        h("div", { class: "field" }, h("label", { text: "Updates" }),
          h("div", { class: "row wrap" }, h("label", { class: "row small", style: { gap: "6px" } }, updChk, "Check for new versions once a day"),
            h("button", { class: "btn sm", html: CC.icon("refresh") + "<span>Check now</span>", onclick: () => CC.checkUpdate(true) })),
          h("div", { class: "hint", text: "Asks GitHub for the latest release. Nothing about you or your study data is sent, and nothing downloads by itself." })),
        h("div", { class: "section-title", text: "Keyboard shortcuts" }),
        h("div", { class: "shortcuts", html: [
          ["⌘ 1-5", "Today · Study · Materials · Playground · Progress"], ["⌘ ↵", "Run code"], ["⇧ ⌘ ↵", "Submit solution (Study)"], ["⌘ S", "Save snippet / note"],
          ["⌘ /", "Comment line"], ["⇧ ⌘ F", "Re-indent (Playground)"], ["⌘ F", "Find in editor"], ["A-D", "Answer a quiz card"], ["⌘ ,", "Settings"], ["⇧ ⌘ K", "Themes"], ["⇧ ⌘ M", "Mute / unmute sounds"], ["Esc", "Close dialog"],
        ].map(([k, d]) => "<span><kbd>" + k.split(" ").join("</kbd> <kbd>") + "</kbd></span><span>" + d + "</span>").join("") }))],
    ];
    const needs = !st.vault_exists ? "sync" : !st.has_key ? "ai" : null;
    let tab = openTab || needs || CC.local.get("settings_tab", "ai");
    if (!TABS.find((t) => t[0] === tab)) tab = "ai";
    const nav = h("nav", { class: "set-nav" });
    const panes = h("div", { class: "set-panes" });
    const showTab = (id) => {
      tab = id; CC.local.set("settings_tab", id);
      nav.querySelectorAll("button[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
      TABS.forEach(([tid, , , el]) => el.classList.toggle("hidden", tid !== id));
      panes.scrollTop = 0;
    };
    TABS.forEach(([id, label, ic, el]) => {
      nav.appendChild(h("button", { "data-t": id, html: CC.icon(ic) + "<span>" + label + "</span>", onclick: () => showTab(id) }));
      panes.appendChild(el);
    });
    nav.appendChild(h("span", { class: "spacer" }));
    nav.appendChild(h("button", { class: "set-quit", html: CC.icon("power") + "<span>Quit CodeCoach</span>", title: "Save everything and quit", onclick: quitApp }));
    const body = h("div", { class: "settings set-layout" },
      msg ? h("div", { class: "banner", text: msg }) : null, nav, panes);
    const save = async () => {
      const problem = ai.problem();
      if (problem) { showTab("ai"); return CC.toast(problem, true); }
      const b = { vault: vault.value.trim(), sync_dir: syncD.value.trim(), teach_skill_path: teach.value.trim(),
        ai: ai.line(), max_tokens: +maxTok.value || 8000, compact_at: +compact.value || 40000, auto_quit_minutes: +quitMin.value, check_updates: updChk.checked,
        coach_name: coachName.value.trim() || "Coach" };
      if (ai.keys()) b.keys = ai.keys();
      const r = await CC.api("/api/config", b);
      if (r.error) return CC.toast(r.error, true);
      CC.rememberAI(b.ai);
      CC.closeModal();
      await CC.refreshState();
      CC.toast("Settings saved");
      CC.go(S.view || "today");
      if (!S.state.has_key) CC.toast("The AI isn't ready yet - add the API key for " + S.state.ai.label + " (Settings > AI & coach).", true);
      if (CC.S.session) { CC.S.sys = null; CC.toast("New name / AI settings apply from your next message."); }
    };
    showTab(tab);
    CC.modal("Settings", body, [btn("Cancel", null, CC.closeModal, "ghost"), btn("Save", "save", save, "primary")], { wide: true, noFocus: true });
  };
  // Export everything: one zip of every note, solution, session and setting (no API keys)
  CC.exportAll = async function () {
    CC.toast("Packing your Library...");
    try {
      const r = await fetch("/api/export", { method: "POST", headers: { "X-CC-Token": window.CC_TOKEN, "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const blob = await r.blob();
      const a = h("a", { href: URL.createObjectURL(blob), download: "CodeCoach-export-" + CC.today() + ".zip" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      CC.toast("Exported " + Math.max(1, Math.round(blob.size / 1024)) + " KB - check your Downloads folder");
    } catch (e) { CC.toast("Export failed: " + e.message, true); }
  };
  async function quitApp() {
    // Never block quitting. A card waiting for your answer is re-shown when you resume; a reply being written is stopped.
    const mid = S.session && S.busy && !S.pending;
    const name = S.session ? "\"" + (S.session.title || "your session") + "\"" : "";
    if (!(await CC.confirm("Quit CodeCoach?", (mid ? CC.coachName() + " is in the middle of a reply in " + name + " - quitting stops that reply (press Retry when you're back). " :
      S.pending ? "The card waiting for your answer in " + name + " will be shown again when you resume. " : "") +
      "Everything is saved. Open the CodeCoach app again any time to continue.", "Quit"))) return;
    if (mid && S.abort) { S.stopReq = true; try { S.abort.abort(); } catch (e) {} }
    if (CC.flushSave) CC.flushSave();
    await CC.api("/api/shutdown", {});
    document.body.innerHTML = '<div class="empty" style="margin:auto"><h3>CodeCoach has quit</h3><p>You can close this window. Open the CodeCoach app to start again.</p></div>';
    setTimeout(() => {
      try { if (window.CC_NATIVE) window.webkit.messageHandlers.cc.postMessage({ quit: true }); } catch (e) {}
      window.close();
    }, 400);
  }


  // ================================================================== THEMES (monkeytype-style picker with live preview)
  function themeChip(t) {
    const c = h("span", { class: "theme-chip" });
    CCThemes.apply(t, null, c);
    c.append(h("i", { style: { background: "var(--bg)" } }), h("i", { style: { background: "var(--accent)" } }), h("i", { style: { background: "var(--text)" } }));
    return c;
  }
  CC.views.themes = function () {
    const p = CC.prefs;
    let filter = CC.local.get("theme_filter", "all"), q = "";
    const follow = h("input", { type: "checkbox" }); follow.checked = !p.theme || p.theme === "system";
    const search = h("input", { type: "search", placeholder: "Search themes" });
    const grid = h("div", { class: "theme-grid" });
    const note = h("div", { class: "hint" });
    const filt = h("div", { class: "seg" });
    [["all", "All"], ["light", "Light"], ["dark", "Dark"], ["fun", "Fun ✦"]].forEach(([k, l]) => filt.appendChild(h("button", { class: filter === k ? "on" : "", text: l, onclick: (e) => { filter = k; CC.local.set("theme_filter", k); filt.querySelectorAll("button").forEach((b) => b.classList.remove("on")); e.target.classList.add("on"); draw(); } })));
    const restore = () => CC.applyPrefs();
    const isOn = (t) => follow.checked ? (t.dark ? (p.darkTheme || "midnight") === t.id : (p.lightTheme || "paper") === t.id) : p.theme === t.id;
    const pick = (t) => {
      if (follow.checked) { p.theme = "system"; if (t.dark) p.darkTheme = t.id; else p.lightTheme = t.id; }
      else p.theme = t.id;
      CC.savePrefs(); draw();
      CC.toast("Theme: " + t.name + (follow.checked ? " (used when your Mac is in " + (t.dark ? "dark" : "light") + " mode)" : ""));
    };
    function draw() {
      grid.innerHTML = "";
      note.textContent = follow.checked
        ? "Following your Mac's light/dark setting. Light: " + CCThemes.byId[p.lightTheme || "paper"].name + " · Dark: " + CCThemes.byId[p.darkTheme || "midnight"].name + ". Pick one of each."
        : "Hover to preview, click to keep.";
      const inFilter = (t) => filter === "all" || (filter === "fun" ? t.fun : (filter === "dark") === t.dark);
      let group = null;
      CCThemes.THEMES.filter((t) => inFilter(t) && t.name.toLowerCase().includes(q)).forEach((t) => {
        if (group !== t.dark) {          // "Light" / "Dark" headings; themes are already sorted A-Z inside each
          group = t.dark;
          const n = CCThemes.THEMES.filter((x) => x.dark === t.dark && inFilter(x) && x.name.toLowerCase().includes(q)).length;
          grid.appendChild(h("div", { class: "theme-group" }, h("span", { text: t.dark ? "Dark" : "Light" }), h("span", { class: "muted", text: String(n) })));
        }
        const card = h("button", { class: "theme-card" + (isOn(t) ? " on" : ""), title: t.name },
          h("div", { class: "tc-win" },
            h("div", { class: "tc-line" }, h("b", { text: "Aa" }), h("span", { class: "tc-muted", text: "sub text" })),
            h("div", { class: "tc-code", html: '<span style="color:var(--syn-kw)">int</span> <span style="color:var(--syn-def)">n</span> = <span style="color:var(--syn-num)">42</span>; <span style="color:var(--syn-str)">"hi"</span>' }),
            h("div", { class: "tc-line" }, h("span", { class: "tc-btn", text: "Run" }), h("span", { class: "tc-dot", style: { background: "var(--good)" } }), h("span", { class: "tc-dot", style: { background: "var(--bad)" } }), h("span", { class: "tc-dot", style: { background: "var(--warn)" } }))),
          h("div", { class: "tc-name" }, h("span", { text: t.name }), t.fun ? h("span", { class: "tc-fun", text: "✦" }) : null, isOn(t) ? h("span", { class: "tc-check", html: CC.icon("check") }) : null));
        CCThemes.apply(t, null, card);
        card.onmouseenter = () => CC.applyTheme(t);
        card.onfocus = () => CC.applyTheme(t);
        card.onclick = () => pick(t);
        grid.appendChild(card);
      });
      if (!grid.children.length) grid.appendChild(h("p", { class: "muted small", text: "No theme matches." }));
    }
    grid.onmouseleave = restore;
    search.oninput = () => { q = search.value.trim().toLowerCase(); draw(); };
    follow.onchange = () => {
      if (follow.checked) { p.lightTheme = p.lightTheme || (CC.currentTheme().dark ? "paper" : CC.currentTheme().id); p.darkTheme = p.darkTheme || (CC.currentTheme().dark ? CC.currentTheme().id : "midnight"); p.theme = "system"; }
      else p.theme = CC.currentTheme().id;
      CC.savePrefs(); draw();
    };
    const random = h("button", { class: "btn sm", html: CC.icon("refresh") + "<span>Random</span>", onclick: () => {
      const pool = CCThemes.THEMES.filter((t) => filter === "all" || (filter === "fun" ? t.fun : (filter === "dark") === t.dark));
      pick(pool[Math.floor(Math.random() * pool.length)]);
    } });
    draw();
    CC.modal("Themes", h("div", { class: "stack" },
      h("div", { class: "row wrap" }, search, filt, random, h("span", { class: "spacer" }), h("label", { class: "row small", style: { gap: "6px" } }, follow, "Follow Mac light/dark")),
      note, grid), [h("span", { class: "hint", text: "Accent color, text size and editor font are in Settings." }), h("span", { class: "spacer" }),
      h("button", { class: "btn ghost", text: "Settings", onclick: () => { CC.closeModal(); CC.views.settings(); } }), h("button", { class: "btn primary", text: "Done", onclick: CC.closeModal })], { wide: true, noFocus: true });
    CC._onModalClose = restore;
    setTimeout(() => search.focus(), 30);
  };

  // ================================================================== NEW COURSE
  CC.views.newCourse = function () {
    if (!S.state.vault_exists) return CC.views.settings("Choose your Library folder first - courses live there.", "sync");
    let type = "class";
    const name = h("input", { type: "text", placeholder: "CS 124" });
    const short = h("input", { type: "text", placeholder: "Auto (e.g. CS124)" });
    const lang = h("select", null, ...Object.entries(S.state.languages).map(([k, L]) => h("option", { value: k, text: L.label + (L.tests ? "" : " (playground only)") })));
    const level = h("select", null, ...["beginner (new to programming)", "some experience", "intermediate", "advanced"].map((x) => h("option", { value: x.split(" (")[0], text: x })));
    const goal = h("input", { type: "text", placeholder: "Ace the weekly quizzes / write Java fluently from scratch" });
    const assess = h("input", { type: "text", placeholder: "Weekly CBTF quizzes, midterm, final" });
    const rules = h("input", { type: "text", placeholder: "No AI-written code on homework or quizzes" });
    const minutes = h("input", { type: "number", min: 2, max: 120, value: 10 });
    const folder = h("input", { type: "text", placeholder: "Auto (Courses/<name>)" });
    const classOnly = h("div", { class: "stack" }, h("div", { class: "grid2" },
      h("div", { class: "field" }, h("label", { text: "Assessments" }), assess), h("div", { class: "field" }, h("label", { text: "AI policy for graded work" }), rules)));
    const explain = h("p", { class: "hint", style: { margin: 0 } });
    const setType = (t) => {
      type = t;
      classOnly.classList.toggle("hidden", t !== "class");
      name.placeholder = t === "class" ? "CS 124" : "Learn C++";
      goal.placeholder = t === "class" ? "Ace the weekly quizzes and the final" : "Write C++ fluently and build small projects";
      folder.placeholder = "Auto (" + (t === "class" ? "1_classes" : "2_coding") + "/<name>)";
      explain.textContent = t === "class"
        ? "A class: add your class content in Materials (slides, lessons, practice quizzes, feedback), organize it by unit, and the coach teaches exactly what's tested."
        : "A general track: the coach asks about your background in the first session, writes a roadmap for you, and teaches the language from the ground up.";
      if (t === "general" && S.course && lang.value === "java") lang.value = "cpp";
    };
    const typeSeg = h("div", { class: "seg big" });
    [["class", "A class I'm taking"], ["general", "Learn a language"]].forEach(([v, l]) => typeSeg.appendChild(h("button", { class: v === type ? "on" : "", text: l, onclick: (e) => { typeSeg.querySelectorAll("button").forEach((b) => b.classList.remove("on")); e.target.classList.add("on"); setType(v); } })));
    const adv = h("details", null, h("summary", { class: "small muted", text: "More options" }), h("div", { class: "grid2", style: { marginTop: "10px" } },
      h("div", { class: "field" }, h("label", { text: "Short name (used in file names)" }), short), h("div", { class: "field" }, h("label", { text: "Folder in your Library" }), folder)));
    setType("class");
    const create = async () => {
      if (!name.value.trim()) { name.focus(); return CC.toast("Give it a name.", true); }
      const r = await CC.api("/api/course/create", { type, name: name.value.trim(), short: short.value.trim(), language: lang.value, level: level.value, goal: goal.value.trim(),
        assessments: type === "class" ? assess.value.trim() : "", rules: type === "class" ? rules.value.trim() : "", minutes: +minutes.value || 10, folder: folder.value.trim() || undefined });
      if (r.error) return CC.toast(r.error, true);
      CC.closeModal();
      await CC.refreshState();
      const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      const real = norm(r.folder);
      const c = S.state.courses.find((x) => norm(x.folder) === real) || S.state.courses.find((x) => real.endsWith("/" + norm(x.rel)));
      if (c) CC.setCourse(c.folder);
      CC.toast("Created " + name.value.trim() + " (" + r.created.length + " notes)");
      if (type === "class") CC.go("materials"); else CC.go("study", { fresh: true, mode: "learn", topic: "Plan my roadmap" });
    };
    CC.modal("New course or track", h("div", { class: "stack" }, typeSeg, explain,
      h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", { text: "Name" }), name), h("div", { class: "field" }, h("label", { text: "Language" }), lang)),
      h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", { text: "Your level" }), level), h("div", { class: "field" }, h("label", { text: "Minutes per from-scratch problem (target)" }), minutes)),
      h("div", { class: "field" }, h("label", { text: "Goal" }), goal), classOnly, adv),
    [btn("Cancel", null, CC.closeModal, "ghost"), btn("Create", "check", create, "primary")], { wide: true });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  };
})();
