/* =================================================================
   PhysLab — core application shell + applet loader
   -----------------------------------------------------------------
   Responsibilities:
     1. Resolve the applet registry.
     2. Render the library dashboard grid.
     3. Launch/teardown applets inside the isolated modal surface.

   Applet contract (every applet module default-exports this shape):

     export default {
       meta: {
         id:    'unique-slug',
         title: 'Human Title',
         description: 'One-line summary.',
         icon:  '🧲',                 // emoji or short glyph
         tags:  ['mechanics', '2d'],  // optional
       },
       // Called when the applet is opened. `ctx` exposes shell hooks.
       mount(container, ctx) { ... },
       // Optional. Called when the modal closes — free RAF loops,
       // engines, listeners, GPU contexts, etc. here.
       unmount() { ... },
     };

   Adding a new applet = drop a folder in /applets and add one line
   to /applets/registry.js. No build step required.
   ================================================================= */

import registry from '../applets/registry.js';

/* -----------------------------------------------------------------
   DOM references
   ----------------------------------------------------------------- */
const grid        = document.getElementById('applet-grid');
const gridLoading = document.getElementById('grid-loading');
const searchInput = document.getElementById('library-search');

const modal     = document.getElementById('applet-modal');
const modalTitle= document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const stage     = document.getElementById('applet-stage');

/* The applet currently mounted in the modal, so we can tear it down. */
let activeApplet = null;
/* Element focused before opening the modal — restored on close. */
let lastFocused = null;

/* =================================================================
   Shell context — passed to every applet's mount().
   This is the seam where future cross-cutting features are exposed
   to applets without each applet re-implementing them.
   ================================================================= */
function createAppletContext(meta) {
  return {
    meta,

    /* HOOK: import/export simulation state.
       Applets register serialize()/deserialize() and the shell wires
       these to the Export/Import toolbar buttons. */
    state: {
      register({ serialize, deserialize } = {}) {
        this._serialize = serialize;
        this._deserialize = deserialize;
      },
      exportToFile(filename = `${meta.id}-state.json`) {
        if (!this._serialize) return;
        const blob = new Blob([JSON.stringify(this._serialize(), null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      },
      async importFromFile(file) {
        if (!this._deserialize || !file) return;
        this._deserialize(JSON.parse(await file.text()));
      },
    },

    /* HOOK: physics input validation. Applets can push rule fns that
       reject parameters violating real-world physical constraints. */
    validation: {
      rules: [],
      addRule(fn) { this.rules.push(fn); },
      check(params) {
        const errors = [];
        for (const rule of this.rules) {
          const result = rule(params);
          if (result) errors.push(result);
        }
        return { ok: errors.length === 0, errors };
      },
    },

    /* HOOK: shared 60 FPS render-loop driver with hardware-accel
       friendly timing. Applets opt in instead of managing their own
       requestAnimationFrame bookkeeping. Returns a stop() handle. */
    loop: {
      start(step) {
        let raf;
        let prev = performance.now();
        const tick = (now) => {
          const dt = Math.min(now - prev, 50); // clamp long frames
          prev = now;
          step(dt, now);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      },
    },
  };
}

/* =================================================================
   Library grid
   ================================================================= */
async function loadLibrary() {
  const applets = [];

  // Resolve each registered applet module to read its metadata.
  for (const entry of registry) {
    try {
      const mod = await import(entry.path);
      const applet = mod.default;
      if (!applet || !applet.meta) {
        console.warn(`[PhysLab] "${entry.path}" has no default export with meta; skipping.`);
        continue;
      }
      applets.push({ ...applet, _path: entry.path });
    } catch (err) {
      console.error(`[PhysLab] Failed to load applet "${entry.path}":`, err);
    }
  }

  gridLoading?.remove();

  if (applets.length === 0) {
    grid.innerHTML = '<p class="library-grid__empty">No simulations registered yet.</p>';
    return;
  }

  for (const applet of applets) grid.appendChild(buildCard(applet));
}

function buildCard(applet) {
  const { meta } = applet;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'applet-card';
  card.setAttribute('role', 'listitem');
  card.dataset.search = `${meta.title} ${meta.description} ${(meta.tags || []).join(' ')}`.toLowerCase();

  const tags = (meta.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="applet-card__thumb" aria-hidden="true">${escapeHtml(meta.icon || '◎')}</div>
    <h3 class="applet-card__title">${escapeHtml(meta.title)}</h3>
    <p class="applet-card__desc">${escapeHtml(meta.description || '')}</p>
    <div class="applet-card__tags">${tags}</div>
  `;

  card.addEventListener('click', () => openApplet(applet));
  return card;
}

/* Client-side library filtering. */
function filterLibrary(query) {
  const q = query.trim().toLowerCase();
  for (const card of grid.querySelectorAll('.applet-card')) {
    card.style.display = !q || card.dataset.search.includes(q) ? '' : 'none';
  }
}

/* =================================================================
   Modal lifecycle
   ================================================================= */
async function openApplet(applet) {
  closeApplet(); // ensure a clean stage if one was somehow open

  const ctx = createAppletContext(applet.meta);
  activeApplet = { applet, ctx };

  modalTitle.textContent = applet.meta.title;
  modalDesc.textContent = applet.meta.description || '';

  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  try {
    await applet.mount(stage, ctx);
  } catch (err) {
    console.error(`[PhysLab] Applet "${applet.meta.id}" failed to mount:`, err);
    stage.innerHTML = '<p class="library-grid__empty">This simulation failed to load.</p>';
  }

  document.getElementById('modal-close')?.focus();
}

function closeApplet() {
  if (activeApplet?.applet.unmount) {
    try {
      activeApplet.applet.unmount();
    } catch (err) {
      console.error('[PhysLab] Error during applet unmount:', err);
    }
  }
  activeApplet = null;
  stage.innerHTML = '';
  modal.hidden = true;
  document.body.style.overflow = '';
  lastFocused?.focus?.();
}

/* =================================================================
   Global wiring
   ================================================================= */
function init() {
  searchInput?.addEventListener('input', (e) => filterLibrary(e.target.value));

  // Any element with [data-modal-dismiss] closes the modal (backdrop, ✕).
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-dismiss]')) closeApplet();
  });

  // Escape closes the active applet.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeApplet();
  });

  loadLibrary();
}

/* =================================================================
   Utilities
   ================================================================= */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init();
