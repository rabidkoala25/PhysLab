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
