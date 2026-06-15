/* =================================================================
   Demo applet — "Magnetic README"
   -----------------------------------------------------------------
   A standalone applet page. It starts as an ordinary markdown README
   and, on demand, shatters every individual letter into an
   independent Matter.js rigid body floating in zero gravity.

   Differences from the original Zero-Gravity demo:
     • Letters MAGNETISE back to their original location AND
       orientation (position + angle springs), so the document
       naturally reassembles when left alone.
     • The cursor is a real circular rigid body that physically
       COLLIDES with the letters and shoves them around.
     • Each letter's hitbox is built from the glyph's actual shape
       (convex hull of its rasterised pixels), not a loose rectangle.

   Runs in its own dedicated, full-screen window launched by the
   PhysLab shell. Cross-cutting features come from the shared SDK.
   ================================================================= */

import { createContext, enterImmersive, exitImmersive } from '../../js/applet-sdk.js';

const MATTER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js';

const META = { id: 'magnetic-readme', title: 'Magnetic README' };

/* Tunables. */
const CURSOR_R          = 12;        // physical cursor radius (px)
const HOME_SPRING       = 0.0000024; // pull toward original position
const HOME_ANGLE_SPRING = 0.00012;      // pull toward original orientation
const HOME_ANGLE_DAMP   = 0.86;      // angular velocity damping

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
    simulations. Shove the letters with your cursor &mdash; they
    magnetise back into place when you let them go.
  </p>
  <h2>Features</h2>
  <p>
    Rigid bodies, zero-gravity fields, and a cursor that physically
    collides with matter. Built with <code>Matter.js</code> on plain
    HTML, CSS, and vanilla JavaScript &mdash; no build step.
  </p>
  <h2>Getting Started</h2>
  <p>
    Press <code>Activate Physics</code> above, then drag your cursor
    through the text and watch it reassemble.
  </p>
`;

/* -----------------------------------------------------------------
   Load Matter.js once from CDN.
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

/* =================================================================
   Per-character measurement
   ================================================================= */
function measureCharacters(readmeEl, originRect) {
  const chars = [];
  const walker = document.createTreeWalker(readmeEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    const style = window.getComputedStyle(node.parentElement);
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
   Glyph hitbox extraction
   Rasterise a single glyph to an offscreen canvas, sample its ink,
   and return the convex hull (vertices relative to the glyph's
   em-centre). This gives each body a shape that hugs the real
   letter far more tightly than a bounding rectangle.
   ================================================================= */
const off = document.createElement('canvas');
const offg = off.getContext('2d', { willReadFrequently: true });

function glyphHull(ch, font, w, h) {
  const cw = Math.ceil(w) + 8;
  const chh = Math.ceil(h) + 8;
  off.width = cw;
  off.height = chh;
  offg.clearRect(0, 0, cw, chh);
  offg.font = font;
  offg.textAlign = 'center';
  offg.textBaseline = 'middle';
  offg.fillStyle = '#fff';
  offg.fillText(ch, cw / 2, chh / 2);

  const data = offg.getImageData(0, 0, cw, chh).data;
  const pts = [];
  const step = 2;
  for (let y = 0; y < chh; y += step) {
    for (let x = 0; x < cw; x += step) {
      if (data[(y * cw + x) * 4 + 3] > 100) {
        pts.push({ x: x - cw / 2, y: y - chh / 2 }); // offset from em-centre
      }
    }
  }
  if (pts.length < 3) return null;
  const hull = convexHull(pts);
  return hull.length >= 3 ? hull : null;
}

/* Andrew's monotone chain convex hull. */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const n = pts.length;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/* =================================================================
   App
   ================================================================= */
const ctx = createContext(META);
const runtime = { stopLoop: null, engine: null, listeners: [] };

function build() {
  document.title = `${META.title} — PhysLab`;

  const root = document.createElement('div');
  root.className = 'zg';
  root.dataset.active = 'false';
  root.innerHTML = `
    <div class="zg__topbar">
      <span class="zg__brand">◎ PhysLab</span>
      <span class="zg__name">Magnetic README</span>
      <div class="zg__window-actions">
        <button type="button" class="btn btn--ghost" data-action="fullscreen" title="Toggle fullscreen">⛶ Fullscreen</button>
        <button type="button" class="btn btn--ghost" data-action="close" title="Close window">✕ Close</button>
      </div>
    </div>
    <div class="zg__toolbar">
      <button type="button" class="btn btn--primary" data-action="activate">⚡ Activate Physics</button>
      <button type="button" class="btn btn--ghost" data-action="reset" hidden>↺ Reset</button>
      <span class="zg__hint">Shove the letters — they magnetise back into place.</span>
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
  document.body.appendChild(root);

  const stage    = root.querySelector('.zg__stage');
  const readmeEl = root.querySelector('.zg__readme');
  const canvas   = root.querySelector('.zg__canvas');
  const activateBtn   = root.querySelector('[data-action="activate"]');
  const resetBtn      = root.querySelector('[data-action="reset"]');
  const fullscreenBtn = root.querySelector('[data-action="fullscreen"]');
  const closeBtn      = root.querySelector('[data-action="close"]');
  const fpsMeter      = root.querySelector('[data-meter="fps"]');
  const bodyMeter     = root.querySelector('[data-meter="bodies"]');

  /* Demonstrate the validation hook seam. */
  ctx.validation.addRule((p) =>
    p && p.cursorRadius <= 0 ? 'Cursor radius must be positive.' : null
  );

  /* Window controls. */
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) exitImmersive();
    else enterImmersive();
  });
  closeBtn.addEventListener('click', () => window.close());

  /* Activation also takes the window truly fullscreen (user gesture). */
  const activate = async () => {
    activateBtn.disabled = true;
    enterImmersive();
    const Matter = await loadMatter();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      startSimulation({ Matter, stage, readmeEl, canvas, fpsMeter, bodyMeter });
      root.dataset.active = 'true';
      activateBtn.hidden = true;
      resetBtn.hidden = false;
    }));
  };

  const reset = () => {
    stopSimulation();
    root.dataset.active = 'false';
    activateBtn.hidden = false;
    activateBtn.disabled = false;
    resetBtn.hidden = true;
    fpsMeter.textContent = '—';
    bodyMeter.textContent = '0';
  };

  activateBtn.addEventListener('click', activate);
  resetBtn.addEventListener('click', reset);
}

/* =================================================================
   Simulation core
   ================================================================= */
function startSimulation({ Matter, stage, readmeEl, canvas, fpsMeter, bodyMeter }) {
  const { Engine, Bodies, Composite, Body } = Matter;

  const rect = stage.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g2d = canvas.getContext('2d');
  g2d.scale(dpr, dpr);

  /* Engine — zero gravity. */
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  runtime.engine = engine;

  /* Measure the README and spawn one shaped body per character. */
  const chars = measureCharacters(readmeEl, rect);
  const opts = {
    frictionAir: 0.06,   // damping so letters settle gently at home
    friction: 0,
    restitution: 0.35,
  };

  const letters = chars.map((c) => {
    const hull = glyphHull(c.ch, c.font, c.w, c.h);
    let body = null;
    if (hull) {
      // Convex hull → a body whose outline hugs the real glyph.
      body = Bodies.fromVertices(c.x, c.y, [hull], { ...opts }, true, 0.01, 1);
    }
    if (!body || !body.vertices || body.vertices.length < 3) {
      // Fallback for tiny/odd glyphs.
      body = Bodies.rectangle(c.x, c.y, Math.max(c.w, 5), Math.max(c.h, 5), { ...opts });
    }

    // Home target (centroid + orientation) and the offset that keeps
    // the drawn glyph aligned to the hull through rotation.
    body.zgHome = { x: body.position.x, y: body.position.y };
    body.zgDraw = { x: c.x - body.position.x, y: c.y - body.position.y };
    body.zgChar = c.ch;
    body.zgFont = c.font;
    body.zgColor = c.color;

    // A small initial jiggle so activation has life before it settles.
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.6 });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.02);
    return body;
  });
  Composite.add(engine.world, letters);

  /* Invisible static perimeter walls → letters can never leave. */
  const T = 80;
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, -T / 2, W + T * 2, T, { isStatic: true }),
    Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, { isStatic: true }),
    Bodies.rectangle(-T / 2, H / 2, T, H + T * 2, { isStatic: true }),
    Bodies.rectangle(W + T / 2, H / 2, T, H + T * 2, { isStatic: true }),
  ]);

  /* ----- Physical cursor: a static circle that collides ------- */
  const cursor = Bodies.circle(-9999, -9999, CURSOR_R, {
    isStatic: true,
    restitution: 0.4,
    friction: 0.1,
  });
  Composite.add(engine.world, cursor);

  const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, active: false };
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
  runtime.listeners.push(
    [canvas, 'mousemove', onMove],
    [canvas, 'mouseleave', onLeave],
    [canvas, 'touchmove', onMove],
    [canvas, 'touchend', onLeave],
  );

  bodyMeter.textContent = String(letters.length);

  /* ----- 60 FPS render + step loop (via shared SDK hook) ----- */
  let frames = 0;
  let fpsAccum = 0;

  runtime.stopLoop = ctx.loop.start((dt) => {
    // 1) Magnetism: spring every letter toward its home pose.
    for (const body of letters) {
      const dx = body.zgHome.x - body.position.x;
      const dy = body.zgHome.y - body.position.y;
      Body.applyForce(body, body.position, {
        x: dx * HOME_SPRING * body.mass,
        y: dy * HOME_SPRING * body.mass,
      });
      // Orientation spring: damp spin and pull the angle back to 0.
      const a = Math.atan2(Math.sin(body.angle), Math.cos(body.angle));
      Body.setAngularVelocity(body, body.angularVelocity * HOME_ANGLE_DAMP - a * HOME_ANGLE_SPRING);
    }

    // 2) Move the physical cursor; give it velocity so it imparts
    //    momentum (positionPrev makes the solver see it moving).
    if (mouse.active) {
      Body.setPosition(cursor, { x: mouse.x, y: mouse.y });
      cursor.positionPrev.x = mouse.px < 0 ? mouse.x : mouse.px;
      cursor.positionPrev.y = mouse.py < 0 ? mouse.y : mouse.py;
    } else {
      Body.setPosition(cursor, { x: -9999, y: -9999 });
      cursor.positionPrev.x = -9999;
      cursor.positionPrev.y = -9999;
    }
    mouse.px = mouse.x;
    mouse.py = mouse.y;

    Engine.update(engine, Math.min(dt, 16.667));
    draw(g2d, W, H, letters, mouse);

    frames++;
    fpsAccum += dt;
    if (fpsAccum >= 250) {
      fpsMeter.textContent = String(Math.round((frames * 1000) / fpsAccum));
      frames = 0;
      fpsAccum = 0;
    }
  });
}

/* Custom 2D draw pass — Matter handles physics, we render glyphs. */
function draw(g2d, W, H, letters, mouse) {
  g2d.clearRect(0, 0, W, H);

  g2d.textAlign = 'center';
  g2d.textBaseline = 'middle';
  for (const body of letters) {
    g2d.save();
    g2d.translate(body.position.x, body.position.y);
    g2d.rotate(body.angle);
    g2d.translate(body.zgDraw.x, body.zgDraw.y); // keep glyph on its hull
    g2d.font = body.zgFont;
    g2d.fillStyle = body.zgColor;
    g2d.fillText(body.zgChar, 0, 0);
    g2d.restore();
  }

  // The physical cursor, drawn as a circle.
  if (mouse.active) {
    g2d.beginPath();
    g2d.arc(mouse.x, mouse.y, CURSOR_R, 0, Math.PI * 2);
    g2d.fillStyle = 'rgba(79,156,255,0.15)';
    g2d.fill();
    g2d.lineWidth = 2;
    g2d.strokeStyle = 'rgba(111,176,255,0.9)';
    g2d.stroke();
  }
}

function stopSimulation() {
  runtime.stopLoop?.();
  runtime.stopLoop = null;
  for (const [el, type, fn] of runtime.listeners) el.removeEventListener(type, fn);
  runtime.listeners = [];
  if (runtime.engine && window.Matter) {
    window.Matter.World.clear(runtime.engine.world, false);
    window.Matter.Engine.clear(runtime.engine);
  }
  runtime.engine = null;
}

/* Boot. */
build();
