/* =================================================================
   PhysLab — applet registry
   -----------------------------------------------------------------
   The single list the shell reads to discover simulations.

   Each applet is a fully self-contained page that launches in its
   own dedicated browser window. An entry carries the card metadata
   plus the URL of the applet's page.

   To add a new applet:
     1. Create a folder under /applets (e.g. /applets/projectile/).
     2. Add an `index.html` page for it (use /applets/demo as a
        template; import the shared SDK from /js/applet-sdk.js).
     3. Add one entry below.

   `url` is resolved against THIS module's URL so paths stay correct
   no matter who imports the registry (works as-is on GitHub Pages).
   ================================================================= */

const resolve = (p) => new URL(p, import.meta.url).href;

export default [
  {
    id: 'zero-gravity-readme',
    title: 'Zero-Gravity README',
    description:
      'A rigid-body demo: shatter a markdown README into floating letters you push with your cursor.',
    icon: '🧲',
    tags: ['rigid-body', 'matter.js', 'demo'],
    url: resolve('./demo/index.html'),
  },
  {
    id: 'magnetic-readme',
    title: 'Magnetic README',
    description:
      'Letters magnetise back to their original place and orientation while a physical cursor collides with them.',
    icon: '🔁',
    tags: ['rigid-body', 'matter.js', 'springs'],
    url: resolve('./magnetic/index.html'),
  },
  // {
  //   id: 'projectile',
  //   title: 'Projectile Motion',
  //   description: '…',
  //   icon: '🎯',
  //   tags: ['kinematics'],
  //   url: resolve('./projectile/index.html'),
  // },
];
