/* =================================================================
   PhysLab — Applet SDK
   -----------------------------------------------------------------
   Shared, cross-cutting helpers that every applet page imports, so
   each simulation gets the platform's structural features without
   reimplementing them. This is the central seam for future work.

   Usage (inside an applet page):

     import { createContext, enterImmersive } from '../../js/applet-sdk.js';
     const ctx = createContext({ id: 'my-applet' });
     const stop = ctx.loop.start((dt, now) => { ...step + render... });
   ================================================================= */

/* HOOK: shared 60 FPS render-loop driver with clamped, hardware-
   acceleration-friendly timing. Returns a stop() handle. */
export function createLoop() {
  let raf = null;
  return {
    start(step) {
      let prev = performance.now();
      const tick = (now) => {
        const dt = Math.min(now - prev, 50); // clamp long/background frames
        prev = now;
        step(dt, now);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => { if (raf) cancelAnimationFrame(raf); raf = null; };
    },
  };
}

/* HOOK: physics input validation. Applets register rule functions
   that reject parameters violating real-world physical constraints. */
export function createValidator() {
  const rules = [];
  return {
    addRule(fn) { rules.push(fn); },
    check(params) {
      const errors = [];
      for (const rule of rules) {
        const result = rule(params);
        if (result) errors.push(result);
      }
      return { ok: errors.length === 0, errors };
    },
  };
}

/* HOOK: import/export a simulation's state configuration to/from a
   local file. Applets register serialize()/deserialize(). */
export function createStateIO(meta = {}) {
  let _serialize = null;
  let _deserialize = null;
  return {
    register({ serialize, deserialize } = {}) {
      _serialize = serialize;
      _deserialize = deserialize;
    },
    exportToFile(filename = `${meta.id || 'applet'}-state.json`) {
      if (!_serialize) return;
      const blob = new Blob([JSON.stringify(_serialize(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      URL.revokeObjectURL(url);
    },
    async importFromFile(file) {
      if (!_deserialize || !file) return;
      _deserialize(JSON.parse(await file.text()));
    },
  };
}

/* Bundle the standard hooks into one context object. */
export function createContext(meta = {}) {
  return {
    meta,
    loop: createLoop(),
    validation: createValidator(),
    state: createStateIO(meta),
  };
}

/* Make the current window fill the screen and request true OS-level
   fullscreen. Must be called from within a user gesture for the
   fullscreen request to be honoured; the maximise step is best-effort. */
export function enterImmersive() {
  try {
    window.moveTo(0, 0);
    window.resizeTo(window.screen.availWidth, window.screen.availHeight);
  } catch { /* some browsers block programmatic resize */ }

  const el = document.documentElement;
  if (el.requestFullscreen) return el.requestFullscreen().catch(() => {});
  if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
  return Promise.resolve();
}

/* Exit fullscreen if active (no-op otherwise). */
export function exitImmersive() {
  if (document.fullscreenElement && document.exitFullscreen) {
    return document.exitFullscreen().catch(() => {});
  }
  return Promise.resolve();
}

/* =================================================================
   Controls / Preferences framework
   -----------------------------------------------------------------
   A reusable, slide-in "Controls" tab giving any applet a panel of
   parameter sliders, one-click presets, and a reset — with the
   user's choices persisted to localStorage per applet.

   Usage:

     const controls = createControls({
       id: META.id,                       // namespace for saved prefs
       params: {
         cursorRadius: { label: 'Cursor size', min: 8, max: 90, step: 1, value: 26, unit: 'px' },
         magnetStrength: { label: 'Magnet strength', min: 0, max: 10, step: 0.1, value: 2.4 },
       },
       presets: {
         Default: { cursorRadius: 26, magnetStrength: 2.4 },
         Snappy:  { cursorRadius: 22, magnetStrength: 6.0 },
       },
       onChange: (values, key) => { ... },  // react to changes live
     });

     controls.values.cursorRadius;  // read live, e.g. inside a loop
     controls.destroy();            // remove when the applet tears down

   Each `params` entry: { label, min, max, step, value (default),
   unit? }. The framework only stores/edits numbers; the applet is
   free to scale them (e.g. magnetStrength * 1e-6) when consuming.
   ================================================================= */
export function createControls(config = {}) {
  const {
    id = 'applet',
    title = 'Controls',
    params = {},
    presets = {},
    onChange = () => {},
    container = document.body,
    open = false,
  } = config;

  const STORAGE_KEY = `physlab:controls:${id}`;

  const defaults = {};
  for (const k in params) defaults[k] = params[k].value;

  let savedPrefs = {};
  try { savedPrefs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { /* ignore */ }
  const values = { ...defaults, ...savedPrefs };

  const decimalsOf = (step) => (String(step).split('.')[1] || '').length;
  const fmt = (p, v) => `${Number(v).toFixed(decimalsOf(p.step))}${p.unit ? ' ' + p.unit : ''}`;

  /* --- DOM ----------------------------------------------------- */
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'ctl-tab';
  tab.innerHTML = '<span aria-hidden="true">⚙</span> Controls';

  const panel = document.createElement('aside');
  panel.className = 'ctl-panel';
  panel.dataset.open = open ? 'true' : 'false';
  panel.setAttribute('aria-label', `${title} panel`);

  const presetNames = Object.keys(presets);
  const presetHtml = presetNames.length
    ? `<div class="ctl-section">
         <div class="ctl-section__label">Presets</div>
         <div class="ctl-presets">
           ${presetNames.map((n) => `<button type="button" class="ctl-preset" data-preset="${n}">${n}</button>`).join('')}
         </div>
       </div>`
    : '';

  const slidersHtml = Object.entries(params).map(([key, p]) => `
    <div class="ctl-row" data-row="${key}">
      <div class="ctl-row__head">
        <label for="ctl-${id}-${key}">${p.label || key}</label>
        <span class="ctl-row__val" data-val="${key}">${fmt(p, values[key])}</span>
      </div>
      <input
        id="ctl-${id}-${key}"
        class="ctl-slider"
        type="range"
        min="${p.min}" max="${p.max}" step="${p.step}"
        value="${values[key]}"
        data-key="${key}"
      />
    </div>`).join('');

  panel.innerHTML = `
    <div class="ctl-panel__head">
      <span class="ctl-panel__title">${title}</span>
      <button type="button" class="ctl-panel__close" data-close aria-label="Close controls">✕</button>
    </div>
    <div class="ctl-panel__body">
      ${presetHtml}
      <div class="ctl-section">
        <div class="ctl-section__label">Parameters</div>
        ${slidersHtml}
      </div>
      <div class="ctl-section">
        <button type="button" class="ctl-reset" data-reset>↺ Reset to defaults</button>
      </div>
    </div>
  `;

  container.appendChild(tab);
  container.appendChild(panel);

  /* --- Behaviour ----------------------------------------------- */
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* ignore */ }
  };

  const reflect = (key) => {
    const input = panel.querySelector(`input[data-key="${key}"]`);
    const out = panel.querySelector(`[data-val="${key}"]`);
    if (input) input.value = values[key];
    if (out) out.textContent = fmt(params[key], values[key]);
  };

  const setValue = (key, raw, emit = true) => {
    if (!(key in params)) return;
    values[key] = Number(raw);
    reflect(key);
    save();
    if (emit) onChange(values, key);
  };

  const open_ = () => { panel.dataset.open = 'true'; tab.dataset.hidden = 'true'; };
  const close_ = () => { panel.dataset.open = 'false'; tab.dataset.hidden = 'false'; };

  tab.addEventListener('click', open_);
  panel.addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (key) setValue(key, e.target.value);
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close_();
    if (e.target.closest('[data-reset]')) {
      for (const k in defaults) setValue(k, defaults[k], false);
      onChange(values, null);
      return;
    }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const cfg = presets[preset.dataset.preset] || {};
      for (const k in cfg) if (k in params) setValue(k, cfg[k], false);
      onChange(values, null);
    }
  });

  // Initial sync so the applet starts from the (possibly saved) values.
  onChange(values, null);

  return {
    values,
    el: panel,
    get: (k) => values[k],
    set: (k, v) => setValue(k, v),
    applyPreset: (name) => {
      const cfg = presets[name] || {};
      for (const k in cfg) if (k in params) setValue(k, cfg[k], false);
      onChange(values, null);
    },
    reset: () => {
      for (const k in defaults) setValue(k, defaults[k], false);
      onChange(values, null);
    },
    open: open_,
    close: close_,
    destroy: () => { tab.remove(); panel.remove(); },
  };
}
