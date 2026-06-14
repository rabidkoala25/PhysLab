/* =================================================================
   Demo applet — "The Zero-Gravity Matter.js README"
   -----------------------------------------------------------------
   A rigid-body demo that starts as an ordinary markdown README and,
   on demand, shatters every individual letter into an independent
   Matter.js body floating in zero gravity. Moving the cursor over
   the canvas repels the letters; invisible perimeter walls keep
   every letter on-screen.

   Conforms to the PhysLab applet contract (see js/app.js).
   ================================================================= */

const MATTER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js';

/* Resolve sibling assets relative to this module (GitHub Pages safe). */
const here = new URL('.', import.meta.url);

/* The README markup. Every character here becomes a rigid body. */
const README_HTML = `
  <h1>physics-sandbox</h1>
  <p>
    <span class="badge">build passing</span>
    <span class="badge">v0.1.0</span>
    <span class="badge">MIT</span>
  </p>
  <p>
    A unified, high-performance platform for interactive physics
    simulations. Move your cursor across this document to find out
    why the README is also the demo.
  </p>
  <h2>Features</h2>
  <p>
    Rigid bodies, zero-gravity fields, and a cursor that pushes
    matter around. Built with <code>Matter.js</code> on plain
    HTML, CSS, and vanilla JavaScript &mdash; no build step.
  </p>
  <h2>Getting Started</h2>
  <p>
    Press <code>Activate Physics</code> above, then drag your mouse
    through the text. Reset to reassemble the document.
  </p>
`;

/* -----------------------------------------------------------------
   Load Matter.js once, cache the promise.
   ----------------------------------------------------------------- */
let matterPromise = null;
function loadMatter() {
  if (window.Matter) return Promise.resolve(window.Matter);
  if (matterPromise) return matterPromise;
  matterPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MATTER_CDN;
    s.onload = () => resolve(window.Matter);
    s.onerror = () => reject(new Error('Failed to load Matter.js from CDN'));
    document.head.appendChild(s);
  });
  return matterPromise;
}

/* Inject the scoped stylesheet once. */
function ensureStyles() {
  const href = new URL('demo.css', here).href;
  if (document.querySelector(`link[data-zg-style]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.zgStyle = 'true';
  document.head.appendChild(link);
}

/* =================================================================
   Per-character measurement
   Walks the README's text nodes and returns the on-screen rect +
   computed font/colour of every non-whitespace character, relative
   to the stage container. These become the spawn points for bodies,
   so letters detach from exactly where they were rendered.
   ================================================================= */
function measureCharacters(readmeEl, originRect) {
  const chars = [];
  const walker = document.createTreeWalker(readmeEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    const style = getComputedStyle(node.parentElement);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const color = style.color;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!ch.trim()) continue; // skip spaces / newlines
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      chars.push({
        ch,
        x: r.left - originRect.left + r.width / 2,
        y: r.top - originRect.top + r.height / 2,
        w: r.width,
        h: r.height,
        font,
        color,
      });
    }
  }
  return chars;
}

/* =================================================================
   Applet
   ================================================================= */
export default {
  meta: {
    id: 'zero-gravity-readme',
    title: 'Zero-Gravity README',
    description:
      'A rigid-body demo: shatter a markdown README into floating letters you push with your cursor.',
    icon: '🧲',
    tags: ['rigid-body', 'matter.js', 'demo'],
  },

  /* Mutable runtime handles, cleaned up in unmount(). */
  _runtime: null,

  async mount(container, ctx) {
    ensureStyles();

    /* ----- Build DOM ------------------------------------------- */
    const root = document.createElement('div');
    root.className = 'zg';
    root.dataset.active = 'false';
    root.innerHTML = `
      <div class="zg__toolbar">
        <button type="button" class="btn btn--primary" data-action="activate">
          ⚡ Activate Physics
        </button>
        <button type="button" class="btn btn--ghost" data-action="reset" hidden>
          ↺ Reset
        </button>
        <span class="zg__hint">Move your cursor through the letters once activated.</span>
        <div class="zg__telemetry" aria-hidden="true">
          <div class="zg__meter"><b data-meter="fps">—</b><span>fps</span></div>
          <div class="zg__meter"><b data-meter="bodies">0</b><span>bodies</span></div>
        </div>
      </div>
      <div class="zg__stage">
        <div class="zg__readme">${README_HTML}</div>
        <canvas class="zg__canvas"></canvas>
      </div>
    `;
    container.appendChild(root);

    const stage    = root.querySelector('.zg__stage');
    const readmeEl = root.querySelector('.zg__readme');
    const canvas   = root.querySelector('.zg__canvas');
    const activateBtn = root.querySelector('[data-action="activate"]');
    const resetBtn    = root.querySelector('[data-action="reset"]');
    const fpsMeter    = root.querySelector('[data-meter="fps"]');
    const bodyMeter   = root.querySelector('[data-meter="bodies"]');

    this._runtime = { root, stopLoop: null, engine: null, listeners: [] };

    /* ----- Demonstrate validation hook ------------------------- */
    // A physics platform blocks impossible parameters; here we keep a
    // trivial rule so the seam is visible/tested.
    ctx.validation.addRule((p) =>
      p && p.repulsionRadius < 0 ? 'Repulsion radius cannot be negative.' : null
    );

    /* ----- Activation ------------------------------------------ */
    const activate = async () => {
      activateBtn.disabled = true;
      const Matter = await loadMatter();
      this._startSimulation({
        Matter, root, stage, readmeEl, canvas, ctx,
        fpsMeter, bodyMeter,
      });
      root.dataset.active = 'true';
      activateBtn.hidden = true;
      resetBtn.hidden = false;
    };

    const reset = () => {
      this._stopSimulation();
      root.dataset.active = 'false';
      activateBtn.hidden = false;
      activateBtn.disabled = false;
      resetBtn.hidden = true;
      fpsMeter.textContent = '—';
      bodyMeter.textContent = '0';
    };

    activateBtn.addEventListener('click', activate);
    resetBtn.addEventListener('click', reset);
  },

  /* =================================================================
     Simulation core
     ================================================================= */
  _startSimulation({ Matter, root, stage, readmeEl, canvas, ctx, fpsMeter, bodyMeter }) {
    const { Engine, Bodies, Composite, Body } = Matter;

    const rect = stage.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /* HiDPI canvas. Physics works in CSS pixels; we scale the 2D ctx. */
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g2d = canvas.getContext('2d');
    g2d.scale(dpr, dpr);

    /* Engine — zero gravity. */
    const engine = Engine.create();
    engine.gravity.x = 0;
    engine.gravity.y = 0;
    this._runtime.engine = engine;

    /* Measure the README and spawn one body per character. */
    const chars = measureCharacters(readmeEl, rect);
    const letters = chars.map((c) => {
      const body = Bodies.rectangle(c.x, c.y, Math.max(c.w, 6), Math.max(c.h, 6), {
        frictionAir: 0.02,   // gentle damping → floaty drift
        friction: 0,
        restitution: 0.65,   // bounce off walls and each other
        chamfer: { radius: 2 },
      });
      // A small random nudge + spin so activation feels alive.
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 1.2 });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
      body.zgChar = c.ch;
      body.zgFont = c.font;
      body.zgColor = c.color;
      return body;
    });
    Composite.add(engine.world, letters);

    /* Invisible static perimeter walls → letters can never leave. */
    const T = 80; // wall thickness (kept thick so fast bodies can't tunnel)
    const walls = [
      Bodies.rectangle(W / 2, -T / 2, W + T * 2, T, { isStatic: true }),       // top
      Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, { isStatic: true }),    // bottom
      Bodies.rectangle(-T / 2, H / 2, T, H + T * 2, { isStatic: true }),       // left
      Bodies.rectangle(W + T / 2, H / 2, T, H + T * 2, { isStatic: true }),    // right
    ];
    Composite.add(engine.world, walls);

    /* ----- Cursor repulsion field ------------------------------ */
    const mouse = { x: -9999, y: -9999, active: false };
    const REPEL_RADIUS = 130;
    const REPEL_STRENGTH = 0.00018;

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      mouse.x = point.clientX - r.left;
      mouse.y = point.clientY - r.top;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('touchend', onLeave);
    this._runtime.listeners.push(
      [canvas, 'mousemove', onMove],
      [canvas, 'mouseleave', onLeave],
      [canvas, 'touchmove', onMove],
      [canvas, 'touchend', onLeave],
    );

    bodyMeter.textContent = String(letters.length);

    /* ----- 60 FPS render + step loop (via shell hook) ---------- */
    let frames = 0;
    let fpsAccum = 0;

    this._runtime.stopLoop = ctx.loop.start((dt) => {
      // Apply cursor repulsion before stepping the engine.
      if (mouse.active) {
        for (const body of letters) {
          const dx = body.position.x - mouse.x;
          const dy = body.position.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < REPEL_RADIUS * REPEL_RADIUS && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            const falloff = (REPEL_RADIUS - dist) / REPEL_RADIUS; // 1 near, 0 at edge
            const mag = REPEL_STRENGTH * falloff;
            Body.applyForce(body, body.position, {
              x: (dx / dist) * mag * body.mass,
              y: (dy / dist) * mag * body.mass,
            });
          }
        }
      }

      Engine.update(engine, Math.min(dt, 16.667));
      this._draw(g2d, W, H, letters, mouse, REPEL_RADIUS);

      // Telemetry: smoothed FPS readout.
      frames++;
      fpsAccum += dt;
      if (fpsAccum >= 250) {
        fpsMeter.textContent = String(Math.round((frames * 1000) / fpsAccum));
        frames = 0;
        fpsAccum = 0;
      }
    });
  },

  /* Custom 2D draw pass — Matter handles physics, we render glyphs. */
  _draw(g2d, W, H, letters, mouse, repelRadius) {
    g2d.clearRect(0, 0, W, H);

    g2d.textAlign = 'center';
    g2d.textBaseline = 'middle';
    for (const body of letters) {
      g2d.save();
      g2d.translate(body.position.x, body.position.y);
      g2d.rotate(body.angle);
      g2d.font = body.zgFont;
      g2d.fillStyle = body.zgColor;
      g2d.fillText(body.zgChar, 0, 0);
      g2d.restore();
    }

    // Soft visualisation of the cursor repulsion field.
    if (mouse.active) {
      const grad = g2d.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, repelRadius);
      grad.addColorStop(0, 'rgba(79,156,255,0.18)');
      grad.addColorStop(1, 'rgba(79,156,255,0)');
      g2d.fillStyle = grad;
      g2d.beginPath();
      g2d.arc(mouse.x, mouse.y, repelRadius, 0, Math.PI * 2);
      g2d.fill();
    }
  },

  _stopSimulation() {
    const rt = this._runtime;
    if (!rt) return;
    rt.stopLoop?.();
    rt.stopLoop = null;
    for (const [el, type, fn] of rt.listeners) el.removeEventListener(type, fn);
    rt.listeners = [];
    if (rt.engine && window.Matter) {
      window.Matter.World.clear(rt.engine.world, false);
      window.Matter.Engine.clear(rt.engine);
    }
    rt.engine = null;
  },

  unmount() {
    this._stopSimulation();
    this._runtime = null;
  },
};
