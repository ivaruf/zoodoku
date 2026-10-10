/*
 * update.js — registering the service worker, and the one button that accepts
 * a new build.
 *
 * DELIBERATELY SELF-CONTAINED (copied in shape from lobbots/js/update.js). It
 * imports nothing and exports nothing, and no other module knows it exists.
 * index.html loads it as its own module script, BEFORE js/main.js, so that a
 * game which fails to boot can still be updated out of whatever broke it — a
 * module graph aborts as a whole when one import fails (hub CLAUDE.md §2), and
 * an update button living inside main.js's graph would die with it.
 *
 * THE CONTRACT WITH sw.js
 *   Registered with { updateViaCache: 'none' } and update() called at launch,
 *   so a changed sw.js is noticed on every visit. A new worker precaches and
 *   then WAITS. This file shows #update when one is waiting; the tap is the
 *   ONLY thing in the game that posts SKIP_WAITING.
 *
 * WHY THE BUTTON IS ON THE TITLE SCREEN ONLY
 *   #update lives inside #screen-title, which is hidden whenever a board is on
 *   screen, so an update can never interrupt a puzzle (hub §1, "a deploy must
 *   never destroy a run in progress"). Not a check in a click handler — a
 *   control that is simply not on screen. And the board in progress is saved
 *   on every move, so even a reload from the title loses nothing.
 *
 * WHY THE FIRST INSTALL IS NOT AN UPDATE
 *   On a first visit the worker installs with no controller to replace and
 *   activates at once. "Update ready" there would be a button that reloads for
 *   no reason, so every path below checks that a controller already exists.
 *
 * THE 3-SECOND PROMISE (maxgear/js/main.js applyUpdate)
 *   Relying on `controllerchange` alone leaves the button stuck at "Updating…"
 *   for the rest of the session when that event never comes — a page loaded by
 *   a hard refresh is uncontrolled, and a waiting worker that went redundant
 *   between the offer and the tap never answers. So once the player has asked,
 *   we reload after three seconds regardless. A redundant reload costs a title
 *   screen; a stuck button costs the update.
 */

const button = document.getElementById("update");
const buildLine = document.getElementById("build");

/*
 * Its own words, because this file imports nothing — js/i18n.js included —
 * so a broken game graph cannot take the update button down with it. It
 * reads <html lang> (set from arcade.lang.v1 before first paint) and repaints
 * on `arcade:lang`, as js/screen.js does.
 */
const WORDS = {
  nb: { main: "Ny versjon klar", sub: "Trykk for å oppdatere", fetching: "Henter den nye versjonen…", build: "Versjon" },
  en: { main: "Update ready", sub: "Tap to update", fetching: "Fetching the new version…", build: "Build" },
};
const words = () => WORDS[document.documentElement.lang] || WORDS.nb;
let fetching = false;
let version = null;

function paint() {
  const w = words();
  if (button) {
    const main = button.querySelector(".update-main");
    const sub = button.querySelector(".update-sub");
    if (main) main.textContent = w.main;
    if (sub) sub.textContent = fetching ? w.fetching : w.sub;
  }
  if (buildLine && version) buildLine.textContent = `${w.build} ${version}`;
}
paint();
document.addEventListener("arcade:lang", paint);

/*
 * Did WE ask for the takeover? `controllerchange` also fires when another tab
 * of this game accepts the update, and reloading on that would be exactly the
 * mid-puzzle reload the waiting worker exists to prevent.
 */
let accepted = false;

/** Show the button, wired to the specific worker that is waiting. */
function offer(worker) {
  if (!button || !worker) return;
  button.hidden = false;
  button.onclick = (event) => {
    event.stopPropagation();
    accepted = true;
    button.disabled = true;
    fetching = true;
    paint();
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // A redundant worker can throw here; the fallback below still reloads.
    }
    setTimeout(() => location.reload(), 3000);
  };
}

/**
 * Ask the worker which build is actually serving this session and print it —
 * the string baked into a page is the build the page came from, which during a
 * botched release is the one question you cannot answer by looking.
 */
function showBuild() {
  const worker = navigator.serviceWorker.controller;
  if (!worker || !buildLine) return;
  try {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const v = event.data && event.data.version;
      if (typeof v !== "string") return;
      version = v;
      paint();
      buildLine.hidden = false;
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  } catch {
    // No version line. The game is entirely unaffected, which is the point.
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!accepted) return;
    // The new worker is in charge. Reload so every module in this session
    // comes from one build — and we can only be here from the title screen.
    location.reload();
  });

  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => {
      // Already waiting when we arrived: a previous visit precached it and the
      // player closed the tab before accepting.
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener("statechange", () => {
          if (fresh.state === "installed" && navigator.serviceWorker.controller) offer(fresh);
        });
      });

      // Check for a new sw.js now rather than whenever the browser thinks of
      // it. Harmless when there is nothing new: one conditional GET.
      reg.update().catch(() => {});
    })
    .catch((err) => {
      // An insecure origin, a private window that blocks workers. The game
      // runs perfectly without one; it only loses offline play.
      console.warn("Zoodoku: no service worker this session", err);
    });

  if (navigator.serviceWorker.controller) showBuild();
  else navigator.serviceWorker.ready.then(showBuild).catch(() => {});
}
