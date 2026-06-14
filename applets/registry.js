/* =================================================================
   PhysLab — applet registry
   -----------------------------------------------------------------
   The single list the shell reads to discover simulations.

   To add a new applet:
     1. Create a folder under /applets (e.g. /applets/projectile/).
     2. Add an `applet.js` that default-exports the applet contract
        (see js/app.js for the contract shape).
     3. Add one line below pointing at that module.

   Paths are resolved relative to this file (an ES module), so they
   work as-is on GitHub Pages with no build step.
   ================================================================= */

// Paths are resolved against THIS module's URL so they remain correct no
// matter which module imports the registry (and work as-is on GitHub Pages).
const resolve = (p) => new URL(p, import.meta.url).href;

export default [
  { path: resolve('./demo/applet.js') },
  // { path: resolve('./projectile/applet.js') },
  // { path: resolve('./pendulum/applet.js') },
];
