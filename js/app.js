/* =================================================================
   PhysLab — core application shell + applet launcher
   -----------------------------------------------------------------
   Responsibilities:
     1. Render the library dashboard grid from the registry.
     2. Launch each applet in its own dedicated, full-screen
        browser window (a real OS-level pop-up, not an overlay).

   Each applet is a self-contained page (see /applets/demo) that
   pulls shared, cross-cutting features from /js/applet-sdk.js
   (60 FPS loop, state import/export, physics input validation).

   Adding a new applet = drop a folder with an index.html into
   /applets and add one entry to /applets/registry.js. No build step.
   ================================================================= */

import registry from '../applets/registry.js';

/* -----------------------------------------------------------------
   DOM references
   ----------------------------------------------------------------- */
const grid         = document.getElementById('applet-grid');
const gridLoading  = document.getElementById('grid-loading');
const searchInput  = document.getElementById('library-search');
const popupWarning = document.getElementById('popup-warning');

/* Track open applet windows so re-clicking focuses instead of dupes. */
const openWindows = new Map();

/* =================================================================
   Library grid
   ================================================================= */
function renderLibrary() {
  gridLoading?.remove();

  if (!registry.length) {
    grid.innerHTML = '<p class="library-grid__empty">No simulations registered yet.</p>';
    return;
  }

  for (const applet of registry) grid.appendChild(buildCard(applet));
}

function buildCard(applet) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'applet-card';
  card.setAttribute('role', 'listitem');
  card.dataset.search =
    `${applet.title} ${applet.description} ${(applet.tags || []).join(' ')}`.toLowerCase();

  const tags = (applet.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="applet-card__thumb" aria-hidden="true">${escapeHtml(applet.icon || '◎')}</div>
    <h3 class="applet-card__title">${escapeHtml(applet.title)}</h3>
    <p class="applet-card__desc">${escapeHtml(applet.description || '')}</p>
    <div class="applet-card__tags">${tags}</div>
  `;

  card.addEventListener('click', () => launchApplet(applet));
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
   Launch — open the applet in its own dedicated full-screen window
   ================================================================= */
function launchApplet(applet) {
  const name = `physlab-${applet.id}`;

  // If this applet's window is already open, just focus it.
  const existing = openWindows.get(name);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }

  // Size the window to fill the screen and strip browser chrome so it
  // reads as a dedicated, immersive simulation surface. The applet
  // page then requests true fullscreen on first interaction.
  const w = window.screen.availWidth;
  const h = window.screen.availHeight;
  const features = [
    'popup=yes',
    `width=${w}`,
    `height=${h}`,
    'left=0',
    'top=0',
    'noopener=no',
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  const win = window.open(applet.url, name, features);

  if (!win) {
    // Pop-up blocked.
    popupWarning.hidden = false;
    setTimeout(() => { popupWarning.hidden = true; }, 8000);
    return;
  }

  popupWarning.hidden = true;
  openWindows.set(name, win);
  win.focus();
  try { win.moveTo(0, 0); win.resizeTo(w, h); } catch { /* some browsers disallow */ }
}

/* =================================================================
   Global wiring
   ================================================================= */
function init() {
  searchInput?.addEventListener('input', (e) => filterLibrary(e.target.value));
  // Tidy up references to windows the user has closed.
  window.addEventListener('focus', () => {
    for (const [k, w] of openWindows) if (w.closed) openWindows.delete(k);
  });
  renderLibrary();
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
