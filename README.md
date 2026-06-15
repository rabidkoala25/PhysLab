# PhysLab — Physics Simulation Platform

A unified, high-performance web platform for interactive physics simulations,
built with **pure HTML, CSS, and vanilla JavaScript** — no build step. It is
designed to be hosted natively on **GitHub Pages** and to run across desktop
and tablet browsers.

## Why

It replaces a fragmented workflow of scattered, feature-deficient online
simulators with a single, fast, extensible library of applets.

## Architecture

```
/
├── index.html            Main shell: header + library dashboard
├── css/
│   └── style.css         Global tokens, layout, dashboard styling
├── js/
│   ├── app.js            Dashboard + applet window launcher (ES module)
│   └── applet-sdk.js     Shared hooks every applet page imports
└── applets/
    ├── registry.js       The list of applets the shell discovers
    ├── demo/             "Zero-Gravity README" rigid-body demo
    │   ├── index.html    Self-contained applet page
    │   ├── applet.js     Applet logic (page controller)
    │   └── demo.css      Scoped styles
    └── magnetic/         "Magnetic README" demo (springs + collisions)
        ├── index.html
        ├── applet.js
        └── magnetic.css
```

Each applet is a **fully self-contained page**. Clicking a card launches it in
its **own dedicated browser window** sized to fill the screen, and the applet
requests true OS-level fullscreen on first interaction — maximum focus and
visual immersion, fully isolated from the dashboard.

## Adding a new applet

No build, no config. Three steps:

1. Create a folder under `/applets`, e.g. `/applets/projectile/`.
2. Add an `index.html` page (copy `/applets/demo` as a template). Inside it,
   pull the shared platform features from the SDK:

   ```js
   import { createContext, enterImmersive } from '../../js/applet-sdk.js';
   const ctx = createContext({ id: 'projectile' });
   const stop = ctx.loop.start((dt, now) => { /* step + render */ });
   ```

3. Register it in [`applets/registry.js`](applets/registry.js):

   ```js
   {
     id: 'projectile',
     title: 'Projectile Motion',
     description: '…',
     icon: '🎯',
     tags: ['kinematics'],
     url: resolve('./projectile/index.html'),
   },
   ```

## Built-in extension hooks

Every applet page imports a `ctx` from `js/applet-sdk.js` exposing cross-cutting
seams so features can be added without each applet reinventing them:

| Hook | Purpose |
| --- | --- |
| `ctx.loop.start(step)` | Shared **60 FPS** render-loop driver with clamped, HW-accel-friendly timing. |
| `ctx.state.register({serialize, deserialize})` | **Import/export** a simulation's state config to/from a local file. |
| `ctx.validation.addRule(fn)` | **Input validation** against real-world physics laws; blocks impossible parameters. |
| `enterImmersive()` / `exitImmersive()` | Maximise the window and toggle true fullscreen. |
| `createControls({ params, presets, onChange })` | A slide-in **Controls tab**: parameter **sliders** + one-click **presets**, with the user's choices **persisted** to `localStorage` per applet. |

### Controls / Preferences framework

`createControls()` (in `js/applet-sdk.js`) gives any applet a settings tab with
zero boilerplate. Define numeric `params` (label / min / max / step / default /
unit) and optional named `presets`; the panel renders sliders with live
readouts, preset buttons, and a reset, and saves edits to `localStorage` so they
survive reloads. `controls.values` is a live object you can read inside a render
loop, and `onChange` fires for reacting immediately. The Magnetic README applet
uses it for cursor size, magnet strength, return twist, spin damping, bounciness,
and air drag.

Additional structural hooks live in the markup/CSS:

- `.render-host` + `.render-host__canvas` — base **WebGL/WebGPU/GPU.js** render layer.
- `.render-host__overlay` — overlay canvas for **velocity/acceleration vectors**
  (`--color-vector-velocity`, `--color-vector-acceleration`).
- `.telemetry` / `.meter` — labelled **charts, graphs, and digital meters**.
- `.controls-rail` / `.control-group` — parameter panels with a validation slot.

## The demo: Zero-Gravity README

`/applets/demo/` starts as an ordinary markdown README. Click **Activate
Physics** and every individual letter detaches into an independent Matter.js
rigid body in **zero gravity**. Moving the cursor repels the letters; invisible
static perimeter walls keep every letter on-screen. Matter.js is loaded via CDN.

A second demo, **Magnetic README** (`/applets/magnetic/`), builds on this: each
letter springs back to its original position *and* orientation (so the document
reassembles itself), the cursor is a real circular rigid body that physically
collides with the letters, and each hitbox is the convex hull of the glyph's
rasterised pixels rather than a loose rectangle.

## Running locally

Because the app uses ES modules, open it through a local web server (not
`file://`):

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

On GitHub Pages it works as-is — just enable Pages on the repository.
