// ZOODOKU service worker: a versioned precache, so the zoo opens on a plane,
// in a tunnel, or across a deploy that lands halfway through a puzzle.
//
// UPDATE MODEL ("opt-in", hub CLAUDE.md §3; shape from lobbots/sw.js). Bump
// VERSION on every committed batch that deploys, and keep the one-line note
// beside it. The page registers with { updateViaCache: 'none' } and calls
// reg.update() at launch (js/update.js), so a changed sw.js is noticed on
// arrival. The new worker precaches the whole list below and then WAITS: the
// title screen shows an update button, and only that tap posts SKIP_WAITING.
// There is deliberately no skipWaiting() in install — taking over unasked
// would swap the module set underneath a child halfway through a board.
//
// GET_VERSION lets the title print the build that is actually serving it.
//
// The cache name is prefixed with the slug and the cleanup filter only ever
// deletes keys that carry that prefix: every game in this hub shares the
// ivaruf.github.io origin and therefore ONE CacheStorage, and a sloppy filter
// evicts a neighbour's offline copy (swirls and fishtank did exactly that to
// each other until 2026-09-20).
//
// All paths are RELATIVE, because the game is served from /zoodoku/ and also
// framed by the arcade from a sibling directory.

const VERSION = 'v0.2.3'; // precache reads past the browser's HTTP cache, so an update can never mix old and new files
const CACHE = `zoodoku-${VERSION}`;

// EVERY SHIPPED FILE, from all four lanes (DESIGN §4). install blocks until
// all of it is cached, so this list is the whole game: a file missing from it
// works online and silently vanishes offline, and a file listed but not
// deployed fails the install outright and strands the player on the previous
// version. Reconcile it against the tree whenever a file is added or removed.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  // Lane C — shell & menus
  './css/style.css',
  './js/main.js',
  './js/ui.js',
  './js/store.js',
  './js/screen.js',
  './js/update.js',
  './js/i18n.js',
  './js/touch-guard.js',
  // Lane B — play surface
  './css/board.css',
  './js/play.js',
  './js/game.js',
  './js/board.js',
  './js/input.js',
  // Lane D — art
  './js/animals.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // Lane A — engine (gen-worker.js is fetched as a module Worker for 9×9, so
  // it has to be here or offline 9×9 falls back to the main thread at best)
  './js/engine.js',
  './js/rng.js',
  './js/grid.js',
  './js/solver.js',
  './js/techniques.js',
  './js/grader.js',
  './js/generator.js',
  './js/levels.js',
  './js/hints.js',
  './js/gen-worker.js',
];

// `cache: 'reload'` on everything the install stores. Without it the precache
// reads through the browser's HTTP cache, which may still hold yesterday's copy
// of a file, so a new version could be filed with some of the old files in it —
// on 2026-10-11 dam_break ran a new screens.js against a stale sound.js and the
// menu never wired up. The arcade learned this first (arcade/sw.js, `fresh`).
const fresh = (url) => new Request(url, { cache: 'reload' });

self.addEventListener('install', (event) => {
  // No skipWaiting() here: after precaching, the new worker stays WAITING
  // until the player accepts the update from the title screen.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map(fresh))));
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // 'zoodoku-' only. Every other game's caches live on this same origin
        // and none of them are ours to delete.
        keys.filter((k) => k.startsWith('zoodoku-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Cache-first out of the current versioned precache, so every module in one
  // session comes from ONE deploy and the play surface can never be a version
  // ahead of the engine it calls. New versions arrive as a whole new cache
  // through install/activate above, never file by file.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
