/*
 * screen.js — the fullscreen plate in the top-right corner (#corner-tools).
 *
 * DELIBERATELY SELF-CONTAINED, the same shape as js/update.js and the file it
 * is copied from (lobbots/js/screen.js): it imports nothing and exports
 * nothing, and no other module knows it exists. index.html loads it as its own
 * module script, independent of js/main.js, so a game that fails to boot for
 * some unrelated reason does not also take down the one button that makes a
 * 9×9 board legible on a phone.
 *
 * NOT NAMED fullscreen.js, and the word does not appear in this path at all.
 * uBlock Origin's DEFAULT filter lists carry a rule matching any repo under
 * github.io whose basename is "fullscreen.js" — it blanked fishtank for every
 * visitor running uBlock, because a blocked import aborts the whole module
 * graph (hub CLAUDE.md §2).
 *
 * SUPPORT IS NOT UNIVERSAL. Safari on iPhone has no Element.requestFullscreen
 * at all, and a button that does nothing when pressed is worse than no button,
 * so the button stays `hidden` (as index.html ships it) unless a working
 * request/exit pair exists. css/style.css carries the explicit
 * `.icon-button[hidden] { display: none }` without which a display:grid plate
 * would show anyway on exactly the browser it hides from.
 *
 * Escape leaves fullscreen without ever touching this button, and so does the
 * browser's own chrome, so the label and aria-pressed are repainted from
 * fullscreenchange rather than only from the click handler.
 *
 * NO ORIENTATION LOCK, unlike lobbots: a sudoku board is square, and the play
 * surface lays itself out for either way up (DESIGN §6). Pinning a phone
 * sideways would only take the choice away from the child holding it.
 *
 * It works inside the arcade's iframe: the arcade's allow list grants
 * `fullscreen`.
 */

const button = document.getElementById("screen-toggle");
const root = document.documentElement;

// webkit-prefixed forms are the fallback for older Safari (iPad has them);
// everywhere else the unprefixed standard names are what exist.
const request = root.requestFullscreen || root.webkitRequestFullscreen || null;
const exit = document.exitFullscreen || document.webkitExitFullscreen || null;

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/* Its own two words per language: this file imports nothing, js/i18n.js
   included. <html lang> is set from arcade.lang.v1 before first paint, and
   `arcade:lang` says when it changes. */
const WORDS = {
  nb: ["Fullskjerm", "Avslutt fullskjerm"],
  en: ["Fullscreen", "Exit fullscreen"],
};

/*
 * Keep label, title and aria-pressed matching reality, whoever changed it.
 * The glyph is swapped by CSS off the same aria-pressed, so what is drawn and
 * what a screen reader hears are one write and cannot drift. The words stay
 * plain: fullscreen is a browser thing with one name everywhere.
 */
function paint() {
  const active = isFullscreen();
  const words = WORDS[document.documentElement.lang] || WORDS.nb;
  const label = active ? words[1] : words[0];
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", label);
  button.title = label;
}

if (button && request && exit) {
  button.hidden = false;
  paint();

  button.addEventListener("click", (event) => {
    // The corner floats over every screen; a click on it is never also a
    // click on whatever is underneath (DESIGN §6, "corner clicks
    // stopPropagation").
    event.stopPropagation();
    const result = isFullscreen() ? exit.call(document) : request.call(root);
    // Both return promises that can reject — a permissions policy, a declined
    // prompt. fullscreenchange already reports what really happened, so this
    // exists only to stop a refusal reaching index.html's crash bar.
    if (result && typeof result.catch === "function") result.catch(() => {});
  });

  document.addEventListener("fullscreenchange", paint);
  document.addEventListener("webkitfullscreenchange", paint);
  // js/i18n.js announces a language switch; repaint the label in the new one.
  document.addEventListener("arcade:lang", paint);
}
