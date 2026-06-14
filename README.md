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
├── index.html            Main shell: header, library dashboard, applet modal
├── css/
│   └── style.css         Global tokens, layout, dashboard + modal styling
├── js/
│   └── app.js            App shell + applet loader (ES module)
└── applets/
    ├── registry.js       The list of applets the shell discovers
    └── demo/             "Zero-Gravity README" rigid-body demo
        ├── applet.js     Applet module (default-exports the contract)
        └── demo.css      Scoped styles, loaded on demand
```

Applets launch in an **isolated modal overlay** for a focused, immersive view.

## Adding a new applet

No build, no config. Three steps:

1. Create a folder under `/applets`, e.g. `/applets/projectile/`.
2. Add an `applet.js` that default-exports the applet contract:

   ```js
   export default {
     meta: { id, title, description, icon, tags },
     mount(container, ctx) { /* render into container */ },
     unmount() { /* free loops, engines, listeners */ },
   };
   ```

3. Register it in [`applets/registry.js`](applets/registry.js):

   ```js
   { path: './projectile/applet.js' },
   ```

## Built-in extension hooks

The shell passes every applet a `ctx` object exposing cross-cutting seams so
features can be added without each applet reinventing them:

| Hook | Purpose |
| --- | --- |
| `ctx.loop.start(step)` | Shared **60 FPS** render-loop driver with clamped, HW-accel-friendly timing. |
| `ctx.state.register({serialize, deserialize})` | **Import/export** a simulation's state config to/from a local file. |
| `ctx.validation.addRule(fn)` | **Input validation** against real-world physics laws; blocks impossible parameters. |

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

## Running locally

Because the app uses ES modules, open it through a local web server (not
`file://`):

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

On GitHub Pages it works as-is — just enable Pages on the repository.
