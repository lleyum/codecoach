/* CodeCoach themes.
   Each theme gives a small base palette. Everything else (borders, hover fills, tinted
   backgrounds, text-on-accent) is derived from it, and every color that is used as TEXT is
   checked against the surface it sits on and nudged until it is readable (WCAG contrast). */
(function (root) {
  "use strict";
  // [id, name, dark, bg, surface, text, muted, accent, good, bad, warn, [keyword, string, number, function, type, builtin]]
  const RAW = [
    // ---------------- light
    ["paper", "Paper", 0, "#f6f6f4", "#ffffff", "#18181b", "#71717a", "#4f46e5", "#15803d", "#c62828", "#b45309", ["#a1267a", "#1a7f45", "#b35900", "#2259b8", "#0e7490", "#7c3aed"]],
    ["latte", "Latte", 0, "#e6e9ef", "#eff1f5", "#4c4f69", "#6c6f85", "#8839ef", "#40a02b", "#d20f39", "#df8e1d", ["#8839ef", "#40a02b", "#fe640b", "#1e66f5", "#df8e1d", "#ea76cb"]],
    ["solarized-light", "Solarized Light", 0, "#eee8d5", "#fdf6e3", "#073642", "#657b83", "#268bd2", "#859900", "#dc322f", "#b58900", ["#859900", "#2aa198", "#d33682", "#268bd2", "#b58900", "#6c71c4"]],
    ["dawn", "Dawn", 0, "#f2e9e1", "#fffaf3", "#575279", "#797593", "#c86f6a", "#3e8f5a", "#b4637a", "#ea9d34", ["#286983", "#ea9d34", "#d7827e", "#56949f", "#907aa9", "#b4637a"]],
    ["gruvbox-light", "Gruvbox Light", 0, "#f2e5bc", "#fbf1c7", "#3c3836", "#7c6f64", "#af3a03", "#79740e", "#9d0006", "#b57614", ["#9d0006", "#79740e", "#8f3f71", "#076678", "#b57614", "#427b58"]],
    ["everforest-light", "Everforest Light", 0, "#efebd4", "#fdf6e3", "#5c6a72", "#829181", "#7f9400", "#8da101", "#f85552", "#dfa000", ["#f85552", "#8da101", "#df69ba", "#3a94c5", "#dfa000", "#35a77c"]],
    ["sakura", "Sakura", 0, "#fbeff3", "#fff8fa", "#3b2a33", "#8a6b7a", "#d6457f", "#2f8f5b", "#c43c3c", "#b7791f", ["#c2337a", "#2f8f5b", "#b5651d", "#5b5bd6", "#0f7c8a", "#8e44ad"]],
    ["mint", "Mint", 0, "#eaf4ee", "#fbfefc", "#17302a", "#5d7a70", "#0f9d76", "#15803d", "#c2410c", "#b45309", ["#0f766e", "#15803d", "#b35900", "#2563eb", "#7c3aed", "#be185d"]],
    ["lilac", "Lilac", 0, "#f1eefa", "#fcfbff", "#221d3a", "#6e6a86", "#6d4aff", "#2f8f5b", "#d03b5c", "#b7791f", ["#7c3aed", "#2f8f5b", "#c2410c", "#2563eb", "#0e7490", "#be185d"]],
    ["typewriter", "Typewriter", 0, "#e9e4d8", "#f5f1e6", "#2b2622", "#7b7266", "#2e5e8c", "#3d7a4a", "#b23a2e", "#a0661a", ["#b23a2e", "#3d7a4a", "#a0661a", "#2e5e8c", "#6b4c9a", "#7b5b2a"]],
    // ---------------- dark
    ["midnight", "Midnight", 1, "#0e0e10", "#161618", "#ececef", "#93939d", "#7c7cf8", "#4ade80", "#f87171", "#fbbf24", ["#f38ccd", "#86e3a8", "#ffbe6b", "#8ab4ff", "#67e8f9", "#c4b5fd"]],
    ["honey", "Honey", 1, "#2c2e31", "#323437", "#d1d0c5", "#8b8d90", "#e2b714", "#8fbf6a", "#e0606c", "#e2b714", ["#e2b714", "#a9c47f", "#e6a65d", "#8fb8de", "#7fc8c0", "#c792ea"]],
    ["dracula", "Dracula", 1, "#21222c", "#282a36", "#f8f8f2", "#7d8bc2", "#bd93f9", "#50fa7b", "#ff5555", "#f1fa8c", ["#ff79c6", "#f1fa8c", "#bd93f9", "#50fa7b", "#8be9fd", "#ffb86c"]],
    ["nord", "Nord", 1, "#2e3440", "#3b4252", "#eceff4", "#9aa5b8", "#88c0d0", "#a3be8c", "#d57780", "#ebcb8b", ["#81a1c1", "#a3be8c", "#b48ead", "#88c0d0", "#8fbcbb", "#d08770"]],
    ["gruvbox-dark", "Gruvbox Dark", 1, "#1d2021", "#282828", "#ebdbb2", "#a89984", "#fe8019", "#b8bb26", "#fb4934", "#fabd2f", ["#fb4934", "#b8bb26", "#d3869b", "#83a598", "#fabd2f", "#8ec07c"]],
    ["mocha", "Mocha", 1, "#181825", "#1e1e2e", "#cdd6f4", "#9399b2", "#cba6f7", "#a6e3a1", "#f38ba8", "#f9e2af", ["#cba6f7", "#a6e3a1", "#fab387", "#89b4fa", "#f9e2af", "#f5c2e7"]],
    ["tokyo-night", "Tokyo Night", 1, "#16161e", "#1a1b26", "#c0caf5", "#8088b0", "#7aa2f7", "#9ece6a", "#f7768e", "#e0af68", ["#bb9af7", "#9ece6a", "#ff9e64", "#7aa2f7", "#2ac3de", "#7dcfff"]],
    ["rose-pine", "Rosé Pine", 1, "#191724", "#1f1d2e", "#e0def4", "#908caa", "#ebbcba", "#95c9a0", "#eb6f92", "#f6c177", ["#3e8fb0", "#f6c177", "#ebbcba", "#9ccfd8", "#c4a7e7", "#eb6f92"]],
    ["one-dark", "One Dark", 1, "#21252b", "#282c34", "#c8ced8", "#8a909b", "#61afef", "#98c379", "#e06c75", "#e5c07b", ["#c678dd", "#98c379", "#d19a66", "#61afef", "#e5c07b", "#56b6c2"]],
    ["monokai", "Monokai", 1, "#1e1f1c", "#272822", "#f8f8f2", "#90908a", "#a6e22e", "#a6e22e", "#f92672", "#e6db74", ["#f92672", "#e6db74", "#ae81ff", "#a6e22e", "#66d9ef", "#fd971f"]],
    ["everforest-dark", "Everforest Dark", 1, "#272e33", "#2e383c", "#d3c6aa", "#9da9a0", "#a7c080", "#a7c080", "#e67e80", "#dbbc7f", ["#e67e80", "#a7c080", "#d699b6", "#7fbbb3", "#dbbc7f", "#83c092"]],
    ["kanagawa", "Kanagawa", 1, "#16161d", "#1f1f28", "#dcd7ba", "#8a8980", "#7e9cd8", "#98bb6c", "#e46876", "#e6c384", ["#957fb8", "#98bb6c", "#d27e99", "#7e9cd8", "#7aa89f", "#ffa066"]],
    ["solarized-dark", "Solarized Dark", 1, "#002b36", "#073642", "#dfe3dc", "#93a1a1", "#268bd2", "#859900", "#dc322f", "#b58900", ["#859900", "#2aa198", "#d33682", "#268bd2", "#b58900", "#6c71c4"]],
    ["carbon", "Carbon", 1, "#141414", "#1c1c1c", "#f3f3f3", "#8f8f8f", "#f66e0d", "#6fcf97", "#ff5c5c", "#f2c94c", ["#f66e0d", "#a5d6a7", "#f2c94c", "#7ab8ff", "#4fd1c5", "#d19bff"]],
    ["terminal", "Terminal", 1, "#000000", "#0b120b", "#c8f7c5", "#6f9f6f", "#22e000", "#22e000", "#ff4d4d", "#e6ff3a", ["#22e000", "#9cff8f", "#e6ff3a", "#6cf0ff", "#b0ffb0", "#74e0a0"]],
    ["vaporwave", "Vaporwave", 1, "#1a1033", "#23164a", "#f2e9ff", "#a693c9", "#ff71ce", "#05ffa1", "#ff5c8a", "#fffb96", ["#ff71ce", "#05ffa1", "#fffb96", "#01cdfe", "#b967ff", "#ff9f5a"]],
    ["coffee", "Coffee", 1, "#1e1714", "#2a201b", "#ede0d4", "#a38f80", "#d4a373", "#a3c28a", "#e07a5f", "#e9c46a", ["#e07a5f", "#a3c28a", "#e9c46a", "#d4a373", "#8ecae6", "#c9a0dc"]],
    ["ocean", "Ocean", 1, "#0b1622", "#102030", "#dbe9f4", "#7f98ad", "#38bdf8", "#34d399", "#f87171", "#fbbf24", ["#c084fc", "#34d399", "#fbbf24", "#38bdf8", "#2dd4bf", "#f472b6"]],
    ["botanical", "Botanical", 1, "#1b2420", "#22302a", "#e3eadf", "#8fa596", "#7fbf8e", "#7fbf8e", "#e98a7a", "#e6c27a", ["#e98a7a", "#b5d99c", "#e6c27a", "#7fbf8e", "#8ccfd1", "#c3a6e0"]],
    ["blush", "Blush", 1, "#1c1b1d", "#252326", "#f2e3e3", "#a39295", "#deaf9d", "#9fcf9a", "#e57373", "#e8c48a", ["#deaf9d", "#9fcf9a", "#e8c48a", "#a3b8e6", "#8fd3cf", "#d7a3d9"]],
    // ---------------- fun (13th field: second accent for gradients, and the "fun" tag)
    ["synthwave", "Synthwave", 1, "#1e1729", "#262035", "#f4eefa", "#a59bb9", "#ff7edb", "#72f1b8", "#fe4450", "#fede5d", ["#fede5d", "#ff8b39", "#f97e72", "#36f9f6", "#ff7edb", "#72f1b8"], { accent2: "#36f9f6", fun: 1 }],
    ["cyberpunk", "Cyberpunk", 1, "#0b0b10", "#14141c", "#f0f0f0", "#8b8ba0", "#fcee0a", "#00ff9f", "#ff2a55", "#ff9a00", ["#ff2a55", "#00ff9f", "#fcee0a", "#00f0ff", "#c86bfa", "#ff9a00"], { accent2: "#00f0ff", fun: 1 }],
    ["aurora", "Aurora", 1, "#0a1315", "#10201f", "#e6f4f1", "#86a8a2", "#5eead4", "#4ade80", "#fb7185", "#facc15", ["#a78bfa", "#86efac", "#fcd34d", "#5eead4", "#7dd3fc", "#f0abfc"], { accent2: "#a78bfa", fun: 1 }],
    ["sunset", "Sunset", 1, "#1c0f1d", "#271526", "#fde8e3", "#c09aa6", "#ff8a5b", "#8be3a6", "#ff5d73", "#ffd166", ["#ff4f9a", "#ffd166", "#ff8a5b", "#7cc6fe", "#c3a6ff", "#8be3a6"], { accent2: "#ff4f9a", fun: 1 }],
    ["lofi", "Lo-fi Dusk", 1, "#28253a", "#312d44", "#ebe6f4", "#a7a1bb", "#c3a6ff", "#9ee6b8", "#ff9aa2", "#ffd59e", ["#c3a6ff", "#9ee6b8", "#ffd59e", "#8ecbff", "#ffb4a2", "#f5a9e1"], { accent2: "#ffb4a2", fun: 1 }],
    ["ember", "Ember", 1, "#150c09", "#1f1410", "#f6e7dc", "#b09484", "#ff6b35", "#9bd17b", "#ff4d4d", "#f7c548", ["#ff6b35", "#c9d17b", "#f7c548", "#ffa37a", "#e9b384", "#ff8fab"], { accent2: "#f7c548", fun: 1 }],
    ["deep-sea", "Deep Sea", 1, "#06111d", "#0b1b2c", "#d7ecff", "#7f9db8", "#00d1b2", "#3ee08f", "#ff6b81", "#ffd166", ["#7aa2ff", "#3ee08f", "#ffd166", "#00d1b2", "#5ad1ff", "#c792ea"], { accent2: "#3a86ff", fun: 1 }],
    ["arcade", "Arcade", 1, "#0e0e22", "#171738", "#ececff", "#9a9ad0", "#ff3e6c", "#3effc8", "#ff6262", "#ffe03e", ["#ff3e6c", "#3effc8", "#ffe03e", "#5ab8ff", "#c38bff", "#ff9f43"], { accent2: "#ffe03e", fun: 1 }],
    ["grape-soda", "Grape Soda", 1, "#1b0f27", "#251535", "#f3e8ff", "#b49cc8", "#b388ff", "#7ee8a5", "#ff6b9a", "#ffd479", ["#ff80ab", "#7ee8a5", "#ffd479", "#b388ff", "#82d8ff", "#f8b4ff"], { accent2: "#ff80ab", fun: 1 }],
    ["forest-night", "Forest Night", 1, "#0e1813", "#15231b", "#e2efe4", "#8fab96", "#57cc99", "#80ed99", "#f28482", "#f6bd60", ["#f6bd60", "#80ed99", "#f28482", "#57cc99", "#a0c4ff", "#cdb4db"], { accent2: "#c7f9cc", fun: 1 }],
    ["matrix-rain", "Matrix Rain", 1, "#020a04", "#071209", "#b9f5c4", "#5f9a6a", "#00e05a", "#00e05a", "#ff5f56", "#d6f700", ["#00e05a", "#8affb0", "#d6f700", "#5cf0d0", "#b0ffb0", "#7fd6a0"], { accent2: "#7dffb0", fun: 1 }],
    ["bubblegum", "Bubblegum", 0, "#ffe6f2", "#fff6fa", "#3a1d2e", "#8e6479", "#e8338a", "#1f9d63", "#c92a5a", "#b8730a", ["#c2185b", "#1f9d63", "#b35900", "#6a3df0", "#0e7c86", "#a23ccf"], { accent2: "#8a5cff", fun: 1 }],
    ["arctic", "Arctic", 0, "#e6f0f7", "#f8fbfe", "#13273a", "#5b7489", "#1f7fcf", "#13896b", "#cf3b4a", "#a86b00", ["#6a4bd6", "#13896b", "#b35900", "#1f7fcf", "#0d7a8a", "#b23a8a"], { accent2: "#17b3b3", fun: 1 }],
    ["peach", "Peach", 0, "#ffece0", "#fff8f2", "#3d2418", "#8f6a58", "#f0602a", "#2c8a4e", "#cc2f4c", "#a8650a", ["#c2334d", "#2c8a4e", "#b35900", "#3b6fd1", "#8a5a00", "#9b46c2"], { accent2: "#ff4d6d", fun: 1 }],
    ["matcha", "Matcha Latte", 0, "#ecefdf", "#fbfcf5", "#2a3320", "#6c7a5c", "#5d8227", "#3d7a2a", "#b53a3a", "#9a6b00", ["#7a4f9a", "#3d7a2a", "#a65a00", "#2f6f8f", "#5d8227", "#9a3d6b"], { accent2: "#9cb35e", fun: 1 }],
    ["ice-cream", "Ice Cream", 0, "#f3eeff", "#fffdf9", "#2e2640", "#7a7090", "#e0479a", "#23905f", "#d23a4f", "#a8710c", ["#c2338a", "#23905f", "#b35900", "#2f7fd1", "#0d7f8f", "#7c4dd6"], { accent2: "#3fb3e8", fun: 1 }],
    ["lemonade", "Lemonade", 0, "#fff8d6", "#fffef4", "#2f2a10", "#7d7550", "#d4a200", "#3e8a2e", "#c8342c", "#b06a00", ["#c8342c", "#3e8a2e", "#b06a00", "#2f6fbf", "#7a6200", "#9b3d9b"], { accent2: "#ff7a59", fun: 1 }],
  ];
  const ACCENTS = { indigo: "#4f46e5", blue: "#2563eb", teal: "#0d9488", green: "#16a34a", orange: "#ea580c", rose: "#e11d48", violet: "#7c3aed" };

  // ---------- color math
  const hex2rgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const rgb2hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); }; // t = amount of b
  const lum = (h) => { const c = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Move fg toward `toward` (usually the theme's text color) until it reads well on every bg given.
  function readable(fg, bgs, min, toward) {
    let c = fg;
    for (let i = 0; i < 20 && Math.min(...bgs.map((b) => contrast(c, b))) < min; i++) c = mix(fg, toward, (i + 1) * 0.05);
    return c;
  }
  const bestInk = (fill, options) => options.reduce((best, o) => (contrast(fill, o) > contrast(fill, best) ? o : best), options[0]);

  const THEMES = RAW.map((r) => ({ id: r[0], name: r[1], dark: !!r[2], bg: r[3], surface: r[4], text: r[5], muted: r[6], accent: r[7], good: r[8], bad: r[9], warn: r[10], syn: r[11],
    accent2: (r[12] || {}).accent2 || null, fun: !!(r[12] || {}).fun }));
  // light themes first, then dark; alphabetical within each group
  THEMES.sort((a, b) => (a.dark - b.dark) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const byId = {}; THEMES.forEach((t) => (byId[t.id] = t));

  /** Full set of CSS variables for a theme (optionally with an accent override). */
  function vars(t, accentOverride) {
    const d = t.dark, s = t.surface, text = t.text;
    const accent = accentOverride || t.accent;
    const v = {};
    v.bg = t.bg; v.surface = s;
    v["surface-2"] = mix(s, text, d ? 0.06 : 0.04);
    v["surface-3"] = mix(s, text, d ? 0.11 : 0.08);
    v.border = mix(s, text, d ? 0.13 : 0.11);
    v["border-strong"] = mix(s, text, d ? 0.22 : 0.19);
    // three clearly different layers for the coding workspace: problem (surface) > editor (code-bg) > output (out-bg)
    // keep each layer visibly different from the one above it (contrast >= 1.07); if a layer can't go
    // further in its direction (e.g. a pure-black theme), the layer above gets lifted instead
    const apart = (base, ref, toward) => { let x = base; for (let i = 1; i <= 30 && contrast(x, ref) < 1.07; i++) x = mix(base, toward, i * 0.02); return x; };
    const up = d ? text : "#ffffff", down = d ? "#000000" : text;      // lighter / darker direction for this theme
    v["out-bg"] = d ? mix(t.bg, "#000000", 0.32) : mix(t.bg, text, 0.045);
    v["code-bg"] = apart(d ? mix(t.bg, s, 0.3) : mix(s, t.bg, 0.65), v["out-bg"], d ? up : "#ffffff");
    v["panel-bg"] = apart(s, v["code-bg"], up);
    if (contrast(v["panel-bg"], v["code-bg"]) < 1.07) v["code-bg"] = apart(v["code-bg"], v["panel-bg"], down);
    if (contrast(v["code-bg"], v["out-bg"]) < 1.07) v["out-bg"] = apart(v["out-bg"], v["code-bg"], down);
    const all = [t.bg, s, v["surface-2"], v["code-bg"], v["out-bg"], v["panel-bg"]];
    v.text = readable(text, all, 7, d ? "#ffffff" : "#000000");
    v.muted = readable(t.muted, all, 4.5, v.text);
    v["text-2"] = readable(mix(v.text, v.muted, 0.35), all, 7, v.text);
    const tint = (c, amt) => mix(s, c, amt);
    for (const k of ["good", "bad", "warn"]) {
      v[k + "-bg"] = tint(t[k], d ? 0.16 : 0.12);
      v[k] = readable(t[k], [v[k + "-bg"], s, v["code-bg"], v["out-bg"]], 4.5, v.text);   // text on its tint, cards, editor and output
    }
    v.accent = accent;                                               // used as a fill (buttons, bars, active marks)
    // text on accent fills: pick the most readable ink, then make sure both gradient stops work with it
    const inks = [d ? t.bg : "#ffffff", "#ffffff", "#111111", t.bg];
    const ink = bestInk(accent, inks);
    const away = lum(ink) < 0.2 ? "#ffffff" : "#000000";              // move fills away from the ink color
    const fillFor = (c) => { let x = c; for (let i = 1; i <= 20 && contrast(x, ink) < 4.5; i++) x = mix(c, away, i * 0.05); return x; };
    v.accent = fillFor(accent);
    // second accent for gradients (fun themes set their own; others get a gentle shift of the same hue)
    v["accent-2"] = fillFor((!accentOverride && t.accent2) || mix(accent, away, 0.16));
    v["accent-ink"] = ink;
    v["accent-soft"] = mix(s, accent, d ? 0.18 : 0.12);
    v["accent-text"] = readable(accent, [s, v["accent-soft"], t.bg], 4.5, v.text); // accent used as text (links, active nav)
    v["bad-ink"] = bestInk(v.bad, ["#ffffff", "#111111", t.bg]);
    v.you = mix(s, accent, d ? 0.14 : 0.09);
    const names = ["kw", "str", "num", "def", "type", "builtin"];
    t.syn.forEach((c, i) => (v["syn-" + names[i]] = readable(c, [s, v["code-bg"], v["surface-2"], v["panel-bg"]], 4.5, v.text)));
    // secondary code tokens (properties, annotations, brackets) - derived from the palette, also checked
    v["syn-prop"] = readable(mix(v["syn-def"], v.text, 0.45), [s, v["code-bg"]], 4.5, v.text);
    v["syn-punct"] = readable(mix(v.text, v.muted, 0.55), [s, v["code-bg"]], 4.5, v.text);
    v["syn-comment"] = readable(mix(v.muted, v["syn-str"], 0.12), [s, v["code-bg"], v["surface-2"]], 4.5, v.text);
    v["shadow-sm"] = d ? "0 1px 2px rgba(0,0,0,.4)" : "0 1px 2px rgba(16,16,20,.05)";
    v.shadow = d ? "0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3)" : "0 1px 2px rgba(16,16,20,.05), 0 6px 24px rgba(16,16,20,.06)";
    v["shadow-lg"] = d ? "0 20px 60px rgba(0,0,0,.6)" : "0 20px 60px rgba(16,16,20,.22)";
    v["overlay"] = d ? "rgba(0,0,0,.55)" : "rgba(10,10,14,.42)";
    return v;
  }

  function apply(t, accentOverride, el) {
    const r = el || document.documentElement;
    const v = vars(t, accentOverride);
    for (const k in v) r.style.setProperty("--" + k, v[k]);
    if (!el) {
      r.dataset.theme = t.dark ? "dark" : "light";
      r.style.colorScheme = t.dark ? "dark" : "light";
      try { localStorage.setItem("cc_theme_vars", JSON.stringify({ v, dark: t.dark })); } catch (e) {}
      try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cc) window.webkit.messageHandlers.cc.postMessage({ bg: v.bg, dark: t.dark }); } catch (e) {}
    }
    return v;
  }

  const api = { THEMES, byId, ACCENTS, vars, apply, contrast, mix, readable };
  root.CCThemes = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
