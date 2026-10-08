/* CodeCoach sound & effects: everything is synthesized with the Web Audio API (no audio files),
   so it's tiny, works offline and every sound can be tuned. Settings live in CC.prefs.sound. */
(function () {
  "use strict";
  const CC = window.CC;
  const DEFAULTS = {
    muted: false, volume: 0.6,
    keys: "off", keysCode: true, keysText: true, keysVolume: 0.5,
    pack: "soft", clicks: false, feedback: true, coach: true, timers: true, fxVolume: 0.55,
    celebrate: true,
  };
  const cfg = () => Object.assign({}, DEFAULTS, (CC.prefs && CC.prefs.sound) || {});
  CC.soundDefaults = DEFAULTS;

  let ctx = null, master = null, noise = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    master.gain.value = cfg().volume;
    // an open audio device keeps a real-time thread busy; let it sleep a few seconds after the last sound
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => { if (ctx && ctx.state === "running") ctx.suspend(); }, 4000);
    return ctx;
  }
  let sleepTimer = null;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- building blocks
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function noiseHit(t, { type = "bandpass", freq = 2000, q = 1, gain = 0.4, attack = 0.002, decay = 0.04, out }) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, gain, attack, decay);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, rand(0, 0.3)); src.stop(t + attack + decay + 0.02);
  }
  function tone(t, { freq = 440, to = null, type = "sine", gain = 0.3, attack = 0.004, decay = 0.12, out }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = ctx.createGain(); env(g, t, gain, attack, decay);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + attack + decay + 0.03);
  }
  function bus(vol) { const g = ctx.createGain(); g.gain.value = vol; g.connect(master); return g; }

  // ---- keyboard profiles (k = "key" | "space" | "enter" | "back")
  const KEYS = {
    creamy: { label: "Creamy (soft, muted thock)", play(t, k, out) {
      const low = k === "space" || k === "enter" ? 0.78 : 1;
      noiseHit(t, { type: "lowpass", freq: 1500 * low * rand(0.92, 1.08), q: 0.7, gain: 0.5, decay: 0.045, out });
      tone(t, { freq: 190 * low * rand(0.95, 1.05), to: 120, gain: 0.35, decay: 0.05, out });
    } },
    clacky: { label: "Clacky (crisp, bright clicks)", play(t, k, out) {
      const low = k === "space" || k === "enter" ? 0.7 : 1;
      noiseHit(t, { type: "bandpass", freq: 3800 * low * rand(0.9, 1.1), q: 1.4, gain: 0.55, decay: 0.028, out });
      tone(t, { freq: 1900 * low * rand(0.95, 1.05), type: "triangle", gain: 0.06, decay: 0.015, out });
      noiseHit(t + 0.012, { type: "highpass", freq: 5000, q: 0.7, gain: 0.18, decay: 0.012, out });
    } },
    thocky: { label: "Thocky (deep, heavy)", play(t, k, out) {
      const low = k === "space" || k === "enter" ? 0.75 : 1;
      noiseHit(t, { type: "lowpass", freq: 900 * low * rand(0.9, 1.1), q: 1.2, gain: 0.55, decay: 0.06, out });
      tone(t, { freq: 140 * low * rand(0.95, 1.05), to: 85, gain: 0.45, decay: 0.07, out });
    } },
    typewriter: { label: "Typewriter (sharp clack, bell on Enter)", play(t, k, out) {
      noiseHit(t, { type: "highpass", freq: 2400 * rand(0.9, 1.1), q: 0.8, gain: 0.5, decay: 0.022, out });
      tone(t, { freq: 900 * rand(0.95, 1.05), type: "triangle", gain: 0.1, decay: 0.03, out });
      if (k === "enter") tone(t + 0.04, { freq: 1760, gain: 0.18, decay: 0.7, out });
    } },
    bubble: { label: "Bubble (soft pops)", play(t, k, out) {
      const f = (k === "space" || k === "enter" ? 520 : 760) * rand(0.9, 1.15);
      tone(t, { freq: f, to: f * 0.6, gain: 0.22, attack: 0.003, decay: 0.06, out });
    } },
  };
  CC.KEY_PROFILES = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, v.label]));

  // ---- effect packs: each effect is a list of notes [semitone offset, delay, length]
  const PACKS = {
    soft: { label: "Soft (warm, mellow)", wave: "sine", base: 523.25, gain: 0.22 },
    crisp: { label: "Crisp (glassy, bright)", wave: "triangle", base: 783.99, gain: 0.2 },
    retro: { label: "Retro (8-bit)", wave: "square", base: 523.25, gain: 0.07 },
  };
  CC.FX_PACKS = Object.fromEntries(Object.entries(PACKS).map(([k, v]) => [k, v.label]));
  const N = (semi, base) => base * Math.pow(2, semi / 12);
  const FX = {
    click: { cat: "clicks", notes: [[12, 0, 0.025]], gain: 0.35 },
    good: { cat: "feedback", notes: [[0, 0, 0.12], [7, 0.08, 0.2]] },
    bad: { cat: "feedback", notes: [[-5, 0, 0.12], [-8, 0.09, 0.2]], gain: 0.8 },
    pass: { cat: "feedback", notes: [[4, 0, 0.08], [7, 0.06, 0.16]], gain: 0.8 },
    fail: { cat: "feedback", notes: [[-9, 0, 0.16]], gain: 0.7 },
    solve: { cat: "feedback", notes: [[0, 0, 0.1], [4, 0.08, 0.1], [7, 0.16, 0.1], [12, 0.24, 0.35]] },
    levelup: { cat: "feedback", notes: [[0, 0, 0.09], [7, 0.07, 0.09], [12, 0.14, 0.09], [16, 0.21, 0.09], [19, 0.28, 0.45]] },
    message: { cat: "coach", notes: [[9, 0, 0.18]], gain: 0.6 },
    timer: { cat: "timers", notes: [[12, 0, 0.35], [7, 0.4, 0.35], [12, 0.8, 0.6]] },
    toggle: { cat: "timers", notes: [[5, 0, 0.06]], gain: 0.6 },
  };
  CC.FX_LIST = { click: "Click", good: "Right answer", bad: "Wrong answer", pass: "Tests pass", fail: "Tests fail", solve: "Problem solved", levelup: "Topic mastered", message: "Coach replied", timer: "Time's up", toggle: "Pause / resume" };

  const sfx = (CC.sfx = {});
  sfx.play = function (name, force) {
    const c = cfg(), fx = FX[name];
    if (!fx || (!force && (c.muted || !c[fx.cat] || document.hidden))) return;
    if (!audio()) return;
    const p = PACKS[c.pack] || PACKS.soft, out = bus(c.fxVolume * (fx.gain || 1));
    const t0 = ctx.currentTime + 0.005;
    fx.notes.forEach(([semi, delay, len]) => {
      tone(t0 + delay, { freq: N(semi, p.base), type: p.wave, gain: p.gain, attack: 0.006, decay: len, out });
      if (c.pack === "crisp") tone(t0 + delay, { freq: N(semi + 12, p.base), type: "sine", gain: p.gain * 0.25, attack: 0.004, decay: len * 0.7, out });
    });
  };
  sfx.key = function (kind, scope, force) {
    const c = cfg();
    if (!force && (c.muted || c.keys === "off" || !(scope === "code" ? c.keysCode : c.keysText))) return;
    const prof = KEYS[force && c.keys === "off" ? "creamy" : c.keys] || KEYS.creamy;
    if (!audio()) return;
    prof.play(ctx.currentTime + 0.002, kind, bus(c.keysVolume));
  };
  sfx.previewKeys = function (profile) {
    const c = cfg(), prof = KEYS[profile] || KEYS.creamy;
    if (!audio()) return;
    const out = bus(c.keysVolume);
    "hello world".split("").forEach((ch, i) => prof.play(ctx.currentTime + 0.02 + i * rand(0.075, 0.11), ch === " " ? "space" : "key", out));
    prof.play(ctx.currentTime + 1.25, "enter", out);
  };

  // ---- global hooks: typing and clicks
  let lastKey = 0;
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target;
    if (!el || !(el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
    if (el.tagName === "INPUT" && !/^(text|search|password|number|)$/.test(el.type || "")) return;
    const k = e.key;
    let kind = null;
    if (k.length === 1) kind = k === " " ? "space" : "key";
    else if (k === "Enter") kind = "enter";
    else if (k === "Backspace" || k === "Delete") kind = "back";
    else if (k === "Tab") kind = "space";
    if (!kind) return;
    const now = performance.now();
    if (now - lastKey < 18) return;
    lastKey = now;
    sfx.key(kind, el.closest(".CodeMirror") || el.classList.contains("fallback") ? "code" : "text");
  }, true);
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest("button, .btn, .pz-block, .mode, .theme-card, .nav a, .guide-toc a, .units button");
    if (!b || b.disabled || e.target.closest(".CodeMirror")) return;
    sfx.play("click");
  }, true);

  // ---- celebrations: a small burst of accent-colored sparks from an element
  CC.celebrate = function (el, big) {
    const c = cfg();
    if (!c.celebrate || !el || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const r = el.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "spark-layer";
    layer.style.left = r.left + r.width / 2 + "px";
    layer.style.top = r.top + Math.min(40, r.height / 2) + "px";
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      const ang = (Math.PI * 2 * i) / n + rand(-0.2, 0.2), dist = rand(big ? 50 : 30, big ? 120 : 70);
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", Math.sin(ang) * dist - (big ? 20 : 10) + "px");
      s.style.background = i % 3 === 0 ? "var(--good)" : i % 2 ? "var(--accent)" : "var(--accent-2)";
      s.style.animationDelay = rand(0, 0.06) + "s";
      layer.appendChild(s);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  };
})();
