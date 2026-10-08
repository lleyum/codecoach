// Safe Markdown renderer (no dependencies) + code highlighting, copy buttons and mermaid.
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s);
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, a, b) { return "<b>" + (b || a) + "</b>"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + esc(codes[+i]) + "</code>"; });
    return s;
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells = []; let cur = ""; let tick = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
      if (ch === "`") tick = !tick;
      if (ch === "|" && !tick) { cells.push(cur.trim()); cur = ""; } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function render(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0, para = [];
    const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/);
      if (fence) {
        flush();
        const marker = fence[1], lang = (fence[2] || "").toLowerCase();
        const buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(marker)) { buf.push(lines[i]); i++; }
        i++;
        if (lang === "mermaid") out.push('<div class="mermaid">' + esc(buf.join("\n")) + "</div>");
        else out.push('<pre data-lang="' + esc(lang) + '"><code>' + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }
      if (/^---\s*$/.test(line) && i === 0) { // front matter
        let j = 1; while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
        if (j < lines.length) { i = j + 1; continue; }
      }
      if (/^\s*$/.test(line)) { flush(); i++; continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flush(); out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:\-|]+\|\s*$/.test(lines[i + 1])) {
        flush();
        const head = splitRow(line); i += 2;
        let html = "<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
        while (i < lines.length && /^\s*\|/.test(lines[i])) { html += "<tr>" + splitRow(lines[i]).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>"; i++; }
        out.push(html + "</tbody></table>");
        continue;
      }
      if (/^\s*>/.test(line)) {
        flush();
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        const text = buf.join("\n").replace(/^\[!(\w+)\][-+]?\s*/, (_, k) => "**" + k.charAt(0).toUpperCase() + k.slice(1) + ":** ");
        out.push("<blockquote>" + render(text) + "</blockquote>");
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flush();
        const items = [];
        while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (m) items.push({ indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), text: m[3] });
          else items[items.length - 1].text += " " + lines[i].trim();
          i++;
        }
        out.push(renderList(items, 0, items.length));
        continue;
      }
      para.push(line.trim());
      i++;
    }
    flush();
    return out.join("\n");
  }

  function renderList(items, start, end) {
    if (start >= end) return "";
    const base = items[start].indent;
    const tag = items[start].ordered ? "ol" : "ul";
    let html = "<" + tag + ">";
    let i = start;
    while (i < end) {
      const it = items[i];
      let j = i + 1;
      while (j < end && items[j].indent > base) j++;
      const box = it.text.match(/^\[( |x)\]\s+(.*)$/i);
      const text = box ? (box[1].toLowerCase() === "x" ? "&#9745; " : "&#9744; ") + inline(box[2]) : inline(it.text);
      html += "<li>" + text + (j > i + 1 ? renderList(items, i + 1, j) : "") + "</li>";
      i = j;
    }
    return html + "</" + tag + ">";
  }

  const MIME = { java: "text/x-java", "c++": "text/x-c++src", cpp: "text/x-c++src", cc: "text/x-c++src", c: "text/x-csrc", h: "text/x-csrc",
    python: "python", py: "python", javascript: "javascript", js: "javascript", typescript: "text/typescript", ts: "text/typescript",
    go: "go", rust: "rust", rs: "rust", json: "application/json" };

  let mermaidReady = false;
  function enhance(node) {
    node.querySelectorAll("pre[data-lang]").forEach((pre) => {
      if (pre.dataset.done) return;
      pre.dataset.done = "1";
      const code = pre.querySelector("code");
      const lang = pre.dataset.lang;
      if (window.CodeMirror && window.CodeMirror.runMode && MIME[lang]) {
        try { const txt = code.textContent; code.textContent = ""; window.CodeMirror.runMode(txt, MIME[lang], code); } catch (e) { /* plain */ }
      }
      const b = document.createElement("button"); b.className = "copy"; b.textContent = "Copy";
      b.onclick = () => { navigator.clipboard.writeText(code.textContent).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); }); };
      pre.appendChild(b);
      if (lang) { const l = document.createElement("span"); l.className = "lang"; l.textContent = lang; pre.appendChild(l); }
    });
    const nodes = node.querySelectorAll(".mermaid:not([data-processed])");
    if (!nodes.length) return;
    // the diagram library is big (~3 MB): load it only the first time a diagram appears, not on every launch
    if (!window.mermaid && !loadingMermaid) {
      loadingMermaid = new Promise((res) => { const sc = document.createElement("script"); sc.src = "/vendor/mermaid.min.js"; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
    }
    if (!window.mermaid && loadingMermaid) { loadingMermaid.then(() => { if (window.mermaid) enhance(node); else drawPlain(nodes); }); return; }
    if (window.mermaid) {
      if (!mermaidReady) {
        const dark = document.documentElement.dataset.theme === "dark" ||
          (document.documentElement.dataset.theme !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
        window.mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict", fontFamily: "inherit" });
        mermaidReady = true;
      }
      window.mermaid.run({ nodes: nodes }).catch(() => {});
    } else drawPlain(nodes);
  }
  let loadingMermaid = null;
  function drawPlain(nodes) { nodes.forEach((n) => { if (!n.isConnected) return; const pre = document.createElement("pre"); pre.textContent = n.textContent; n.replaceWith(pre); }); }

  function into(node, text) { node.innerHTML = render(text); enhance(node); return node; }

  window.MD = { render, esc, enhance, into, MIME };
})();
