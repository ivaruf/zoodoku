/*
 * intro.js — the three-second sting that plays when the zoo opens.
 *
 * A cream 4×4 board settles onto the meadow, and the animals hop into it one
 * kind at a time — the four foxes, then the frogs, the whales, the lions —
 * each landing in its own cell with a little squash, until every row, column
 * and box holds one of each. The full board gives one soft bounce, every
 * animal hops in a wave the way they do on the win card, and then the board
 * flies down to the little tilted board on the title screen and becomes it:
 * the six animals that are missing from that picture hop out of sight on the
 * way, and the curtain thins away. Nothing in it is text, so it has nothing
 * to translate. No flash, no bang: this is a game for small children, and
 * the sting is the board being tidied rather than a fanfare.
 *
 * WHAT IT MAY NOT DO
 *   - Cost anyone a board (hub §1). It only ever plays at page load, over the
 *     title screen, and any tap or key skips straight to the hand-off.
 *   - Let the skipping press through. A key is swallowed in the capture
 *     phase on window — this script runs async from the top of <body>, well
 *     before the module graph has finished loading, so its listener is
 *     registered before js/main.js's Escape handler and js/input.js's board
 *     keys, and capture on window runs ahead of both anyway — because the
 *     press that skips must not also be the title's Escape (the way out to
 *     the arcade) or Enter on the focused Play door. A tap lands on the
 *     curtain itself, which covers every button and the corner plates.
 *   - Delay the game. It is a curtain over the page, not a gate in front of
 *     it: the modules, the title scene and the engine boot underneath while
 *     it plays.
 *   - Play for someone who has asked for less motion. prefers-reduced-motion
 *     means the script does nothing at all.
 *
 * A classic script, self-contained, importing nothing, for the reason
 * touch-guard.js stands apart: if anything in the module graph fails, the
 * curtain must still lift. Every frame runs inside a try, a hard timeout
 * removes the curtain whatever happens, and a failure of this file leaves the
 * game exactly as it was without it.
 *
 * THE ANIMALS are the real ones: the fox, frog, whale and lion below are
 * js/animals.js's drawings, copied path for path (that file is a module and
 * this one imports nothing). If the art changes there, the sting keeps the
 * old faces until somebody copies it again — the same trade NeonFox makes
 * with its palette. Each is turned into an <svg> data URL once, and baked to
 * a small offscreen canvas per resize, so the frame loop only ever blits.
 *
 * Canvas 2D, devicePixelRatio capped at 2, no allocation in the frame loop
 * (hub §10).
 */
(function () {
  "use strict";

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch (e) {
    /* No matchMedia: play it. */
  }

  // css/style.css's tokens, copied for the same reason the animals are.
  var BG = "#1f5f5b";
  var BG_DEEP = "#174845";
  var BOARD = "#fff6e3";
  var INK = "#2e4a48";
  var SUN = "#ffc94a";
  var LINE = "rgba(46, 74, 72, 0.3)";
  var SHADOW = "rgba(23, 72, 69, 0.85)";

  // The board is js/ui.js drawTitleScene()'s solution, so the board that
  // lands IS the one on the title. SHOWN is its mask: the six zeros are the
  // cells that picture leaves empty, and those animals hop away on landing.
  var SOLUTION = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  var SHOWN = [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1];

  // The timeline, in milliseconds. BOARD_IN: the board settles. HOP0 + i *
  // HOP_GAP: the i-th animal leaves, landing HOP_MS later. DONE: the last one
  // is home and the board bounces. LAND starts the hand-off, which takes
  // LAND_MS (or SKIP_MS when the player skipped).
  var BOARD_IN = 380;
  var HOP0 = 300;
  var HOP_GAP = 95;
  var HOP_MS = 380;
  var SETTLE_MS = 170;
  var DONE = HOP0 + 15 * HOP_GAP + HOP_MS;
  var LAND = DONE + 520;
  var LAND_MS = 680;
  var SKIP_MS = 360;

  // The order they arrive in: one kind at a time, so the sting quietly shows
  // the rule — four foxes, one in every row, every column, every box.
  var ORDER = [];
  for (var d = 1; d <= 4; d++) {
    for (var c = 0; c < 16; c++) if (SOLUTION[c] === d) ORDER.push(c);
  }
  // Where each cell's animal starts its hop, as a fraction of board width
  // left or right of its column, so they come up from below in a spray
  // rather than all along one line.
  var DRIFT = new Float32Array(16);
  for (var k = 0; k < 16; k++) DRIFT[ORDER[k]] = ((k * 7) % 5) / 4 - 0.5;

  // ---- the four drawings, from js/animals.js ---------------------------
  var OW = 4.5;
  function P(d, fill, o) {
    return (
      '<path d="' + d + '" fill="' + fill + '"' +
      (o ? ' stroke="' + o + '" stroke-width="' + OW + '" stroke-linejoin="round"' : "") +
      "/>"
    );
  }
  function C(x, y, r, fill, o) {
    return (
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"' +
      (o ? ' stroke="' + o + '" stroke-width="' + OW + '"' : "") +
      "/>"
    );
  }
  function E(x, y, rx, ry, fill) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>';
  }
  function L(d, color, w) {
    return (
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round"/>'
    );
  }
  function eye(x, y, r) {
    r = r || 5.5;
    var g = (r * 0.36).toFixed(1);
    var q = r * 0.34;
    return C(x, y, r, INK) + C((x + q).toFixed(1), (y - q).toFixed(1), g, "#fff");
  }
  function maneRing(cx, cy, R, bumps, depth) {
    var s = "";
    for (var i = 0; i <= bumps; i++) {
      var a0 = ((i - 0.5) / bumps) * Math.PI * 2 - Math.PI / 2;
      var a1 = (i / bumps) * Math.PI * 2 - Math.PI / 2;
      var a2 = ((i + 0.5) / bumps) * Math.PI * 2 - Math.PI / 2;
      var kR = R + depth * 2;
      if (i === 0) s += "M" + (cx + Math.cos(a0) * R).toFixed(1) + " " + (cy + Math.sin(a0) * R).toFixed(1);
      if (i < bumps) {
        s +=
          "Q" + (cx + Math.cos(a1) * kR).toFixed(1) + " " + (cy + Math.sin(a1) * kR).toFixed(1) +
          " " + (cx + Math.cos(a2) * R).toFixed(1) + " " + (cy + Math.sin(a2) * R).toFixed(1);
      }
    }
    return s + "Z";
  }
  var FOX = (function () {
    var body = "#f28c38", sh = "#d4691f", o = "#8a3f10", cream = "#fff3e2";
    return (
      P("M16 48 L20 8 L46 30 Z", body, o) + P("M84 48 L80 8 L54 30 Z", body, o) +
      P("M23 38 L25 19 L37 30 Z", sh) + P("M77 38 L75 19 L63 30 Z", sh) +
      P("M10 44 C10 30 28 25 50 25 C72 25 90 30 90 44 C90 58 72 72 50 90 C28 72 10 58 10 44 Z", body, o) +
      P("M12 50 C26 50 40 57 50 64 C60 57 74 50 88 50 C84 62 68 75 50 88 C32 75 16 62 12 50 Z", cream) +
      P("M44 80 C44 76 56 76 56 80 C56 84 52 86 50 86 C48 86 44 84 44 80 Z", "#3a2418") +
      eye(35, 45) + eye(65, 45)
    );
  })();
  var FROG = (function () {
    var body = "#5cbf60", sh = "#3e9a46", o = "#24602c", cream = "#f2fbe6";
    return (
      C(29, 34, 16, body, o) + C(71, 34, 16, body, o) +
      P("M6 64 C6 46 26 40 50 40 C74 40 94 46 94 64 C94 82 74 88 50 88 C26 88 6 82 6 64 Z", body, o) +
      C(29, 34, 15.2, body) + C(71, 34, 15.2, body) +
      E(50, 76, 24, 9, sh) + L("M28 64 C38 72 62 72 72 64", o, 4) +
      C(45, 54, 1.8, o) + C(55, 54, 1.8, o) +
      C(29, 33, 10, cream) + C(71, 33, 10, cream) + eye(30, 34, 6) + eye(70, 34, 6)
    );
  })();
  var WHALE = (function () {
    var body = "#4a90d9", sh = "#3672b8", o = "#1f4a80", cream = "#eaf3fc", spray = "#a8d6fb";
    var spout = "M34 28 C33 20 28 15 20 14 M37 27 L37 9 M40 28 C41 20 46 15 54 14";
    return (
      L(spout, o, 9) + L(spout, spray, 4.5) +
      P(
        "M6 60 C6 42 20 32 38 32 C56 32 68 42 74 54 C77 46 78 38 76 30 C82 28 92 26 96 20 C97 30 92 38 84 40 C90 42 94 46 96 52 C88 54 82 52 78 50 C78 72 62 84 40 84 C20 84 6 76 6 60 Z",
        body,
        o
      ) +
      P("M8 64 C20 70 44 72 66 66 C60 78 50 84 40 84 C22 84 10 76 8 64 Z", cream) +
      L("M22 72 L50 72 M28 78 L48 78", "#c3d9f0", 2.5) +
      P("M44 62 C50 58 56 58 60 62 C56 64 50 64 44 62 Z", sh) +
      L("M18 58 C22 61 27 61 30 58", o, 3.5) +
      eye(26, 48, 5.5)
    );
  })();
  var LION = (function () {
    var body = "#f2c230", mane = "#d9822b", maneSh = "#b8641a", o = "#7a4a10", cream = "#fff4d6";
    return (
      P(maneRing(50, 52, 34, 13, 5.5), mane, o) + P(maneRing(50, 52, 27, 13, 3), maneSh) +
      C(29, 32, 7, body, o) + C(71, 32, 7, body, o) + C(50, 54, 26, body, o) +
      E(42, 66, 9.5, 8, cream) + E(58, 66, 9.5, 8, cream) +
      P("M44 58 L56 58 L50 65 Z", "#5a3418") + L("M50 65 L50 70", "#5a3418", 2.5) +
      eye(40, 48, 5) + eye(60, 48, 5)
    );
  })();

  var canvas = document.createElement("canvas");
  canvas.id = "intro";
  canvas.setAttribute("aria-hidden", "true");
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // One image per digit 1..4, and one baked sprite each at the current cell
  // size. A sprite that has not decoded yet is simply not drawn that frame.
  var images = [];
  var sprites = [];
  var spriteOk = [false, false, false, false];
  [FOX, FROG, WHALE, LION].forEach(function (inner, i) {
    var img = new Image();
    img.onload = function () {
      bake(i);
    };
    img.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + inner + "</svg>");
    images.push(img);
    sprites.push(document.createElement("canvas"));
  });

  // A tile of clover dots for the meadow, made once; the pattern repeats in
  // CSS pixels because it is filled under the dpr transform.
  var clover = document.createElement("canvas");
  clover.width = clover.height = 46;
  (function () {
    var g = clover.getContext("2d");
    if (!g) return;
    g.fillStyle = BG_DEEP;
    g.beginPath();
    g.arc(9, 14, 3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(32, 30, 2.5, 0, Math.PI * 2);
    g.fill();
  })();
  var cloverFill = null;
  var sunFill = null;

  var W = 0;
  var H = 0;
  var dpr = 1;
  // The board at centre stage, in CSS pixels: its side, and its cell.
  var B = 0;
  var cell = 0;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    B = Math.max(120, Math.min(W * 0.78, H * 0.56, 360));
    cell = B / 4;
    try {
      cloverFill = ctx.createPattern(clover, "repeat");
    } catch (e) {
      cloverFill = null;
    }
    // The sunlit patch high on the left, as on the body's background.
    sunFill = ctx.createRadialGradient(W * 0.3, H * 0.1, 0, W * 0.3, H * 0.1, Math.max(W, H) * 0.6);
    sunFill.addColorStop(0, "rgba(255, 201, 74, 0.16)");
    sunFill.addColorStop(1, "rgba(255, 201, 74, 0)");
    for (var i = 0; i < 4; i++) bake(i);
  }

  // A sprite is the animal at 84% of a cell (the board's own proportion),
  // with headroom so a squash never clips it.
  function bake(i) {
    var img = images[i];
    if (!img || !img.complete || !img.naturalWidth || !cell) return;
    var s = sprites[i];
    var px = Math.max(8, Math.round(cell * 0.84 * dpr));
    s.width = s.height = px;
    var g = s.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, px, px);
    g.drawImage(img, 0, 0, px, px);
    spriteOk[i] = true;
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  function easeOutBack(x) {
    var c = 1.5;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  }
  function easeInOut(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function easeOut(x) {
    return 1 - (1 - x) * (1 - x);
  }

  // Where the board lives on the title: #title-scene, the square box the
  // tilted mini-board is drawn in. Its own rectangle, untransformed, because
  // the tilt is on the board inside it. The real scene is faded in by hand
  // during the hand-off (opacity, given back at the end) so the two boards
  // cross-fade over each other rather than one popping into the other.
  var target = null;
  var realScene = null;
  function findTarget() {
    realScene = document.getElementById("title-scene");
    if (!realScene) return null;
    realScene.style.opacity = "0";
    var b = realScene.getBoundingClientRect();
    if (b.width < 8 || b.height < 8) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, s: b.width };
  }

  var t0 = 0;
  var landAt = LAND;
  var landMs = LAND_MS;
  var done = false;
  var raf = 0;

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", size);
    if (realScene) realScene.style.opacity = "";
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function skip() {
    var now = performance.now() - t0;
    if (now >= landAt) return;
    landAt = now;
    landMs = SKIP_MS;
  }

  function onKey(e) {
    // Skip, and let the press go no further: see the header.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) skip();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The board, drawn about its own centre (the caller has translated there):
  // cream card, faint cell lines, ink box lines, ink rim, and the hard
  // teal shadow underneath that css/style.css gives .mini-board.
  function drawBoard() {
    var h = B / 2;
    var u = B / 190; // the title board is ~190px with a 4px rim
    ctx.fillStyle = SHADOW;
    roundRect(-h, -h + 8 * u, B, B, 12 * u);
    ctx.fill();
    ctx.fillStyle = BOARD;
    roundRect(-h, -h, B, B, 12 * u);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    for (var i = 1; i < 4; i++) {
      if (i === 2) continue;
      ctx.moveTo(-h + i * cell, -h);
      ctx.lineTo(-h + i * cell, h);
      ctx.moveTo(-h, -h + i * cell);
      ctx.lineTo(h, -h + i * cell);
    }
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(0, h);
    ctx.moveTo(-h, 0);
    ctx.lineTo(h, 0);
    ctx.stroke();
    ctx.lineWidth = 4 * u;
    roundRect(-h, -h, B, B, 12 * u);
    ctx.stroke();
  }

  // One animal at board-local (x, y), its centre, with a squash: sx, sy.
  function drawAnimal(d, x, y, sx, sy, alpha) {
    var i = d - 1;
    if (!spriteOk[i] || alpha <= 0) return;
    var s = cell * 0.84;
    ctx.globalAlpha = alpha;
    // Squash from the feet, so a landing animal sits down into its cell.
    ctx.drawImage(sprites[i], x - (s * sx) / 2, y + s / 2 - s * sy, s * sx, s * sy);
  }

  // A small four-point twinkle in sun yellow — the board being pleased
  // rather than anything going bang.
  function twinkle(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  function frame(now) {
    if (done) return;
    try {
      if (!t0) t0 = now;
      var t = now - t0;
      var land = clamp01((t - landAt) / landMs);
      if (land >= 1) {
        finish();
        return;
      }
      var skipped = landAt < LAND;
      var k = easeInOut(land);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // The meadow curtain, which thins away during the hand-off.
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      if (cloverFill) {
        ctx.fillStyle = cloverFill;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = sunFill;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      // The board's place and size: centre stage, then flying home.
      var cx = W / 2;
      var cy = H / 2 + cell * 0.2;
      var scale = easeOutBack(clamp01(t / BOARD_IN));
      if (land > 0) scale = 1;
      var rot = 0;
      var squashY = 1;
      var alpha = clamp01(t / (BOARD_IN * 0.6));
      // The completed board's one soft bounce.
      var bounce = (t - DONE) / 300;
      if (land === 0 && bounce > 0 && bounce < 1) scale *= 1 + Math.sin(bounce * Math.PI) * 0.045;
      if (land > 0) {
        alpha = 1;
        if (target === null) target = findTarget() || false;
        if (target) {
          cx += (target.x - cx) * k;
          cy += (target.y - cy) * k;
          scale += (target.s / B - 1) * k;
          // .mini-board is rotate(-7deg) under a rotateX(24deg) tip; a
          // rotation and a cos(24°) squash is near enough for 0.7 s, and the
          // last part of the flight is a cross-fade onto the real thing.
          rot = (-7 * Math.PI) / 180 * k;
          squashY = 1 - 0.09 * k;
          var x = clamp01((land - 0.5) / 0.5);
          alpha = 1 - x;
          realScene.style.opacity = String(x);
        } else {
          alpha = 1 - k;
        }
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(scale, scale * squashY);
      ctx.globalAlpha = alpha;
      drawBoard();

      // The animals. Before landing each follows its hop; after DONE they
      // all hop once more in a wave, as on the win card.
      var h = B / 2;
      for (var n = 0; n < 16; n++) {
        var c = ORDER[n];
        var d = SOLUTION[c];
        var col = c % 4;
        var row = (c / 4) | 0;
        var ex = -h + (col + 0.5) * cell;
        var ey = -h + (row + 0.5) * cell;
        var p = (t - HOP0 - n * HOP_GAP) / HOP_MS;
        // A skip lands every animal at once; the hand-off is too short to
        // watch the rest of them arrive.
        if (skipped && land > 0) p = 1 + SETTLE_MS / HOP_MS;
        if (p <= 0) continue;
        var ax = ex;
        var ay = ey;
        var sx = 1;
        var sy = 1;
        var a = alpha;
        if (p < 1) {
          // Up from below the board in an arc, fading in as it comes.
          var q = easeOut(p);
          var sx0 = ex + DRIFT[c] * B * 0.5;
          var sy0 = h + B * 0.55;
          ax = sx0 + (ex - sx0) * q;
          ay = sy0 + (ey - sy0) * p - Math.sin(p * Math.PI) * B * 0.32;
          a *= clamp01(p * 4);
          sx = 0.92;
          sy = 1.08;
        } else {
          var settle = (t - HOP0 - n * HOP_GAP - HOP_MS) / SETTLE_MS;
          if (!skipped && settle < 1) {
            var w = Math.sin(clamp01(settle) * Math.PI);
            sx = 1 + 0.14 * w;
            sy = 1 - 0.14 * w;
          }
          var wave = (t - DONE - (row + col) * 45) / 280;
          if (land === 0 && wave > 0 && wave < 1) ay -= Math.sin(wave * Math.PI) * cell * 0.16;
          // On the way home, the animals the title picture leaves out hop
          // away, so what lands is the picture.
          if (land > 0 && !SHOWN[c]) {
            ay -= Math.sin(clamp01(land * 1.6) * Math.PI * 0.5) * cell * 0.25;
            a *= 1 - clamp01(land * 1.6);
          }
        }
        drawAnimal(d, ax, ay, sx, sy, a);
      }

      // Twinkles round the finished board, gone before the flight.
      var tw = (t - DONE) / 480;
      if (land === 0 && tw > 0 && tw < 1) {
        ctx.fillStyle = SUN;
        ctx.globalAlpha = Math.sin(tw * Math.PI);
        for (var s = 0; s < 8; s++) {
          var ang = (s / 8) * Math.PI * 2 + 0.3;
          var rr = h * (1.12 + 0.18 * tw);
          twinkle(Math.cos(ang) * rr, Math.sin(ang) * rr, cell * (0.1 + 0.06 * (s % 2)));
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } catch (e) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    size();
    window.addEventListener("resize", size);
    window.addEventListener("keydown", onKey, true);
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      skip();
    });
    document.body.appendChild(canvas);
    raf = requestAnimationFrame(frame);
    // Whatever happens to the frame loop, the curtain does not outstay this.
    setTimeout(finish, 6000);
  }

  // Loaded from the top of <body>, so the body exists even though the rest
  // of the page may not have been parsed yet.
  start();
})();
