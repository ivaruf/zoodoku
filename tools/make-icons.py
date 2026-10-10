#!/usr/bin/env python3
"""Generate the ZOODOKU icon set.

    python3 tools/make-icons.py

Writes icons/icon-192.png, icon-512.png, icon-180.png and
icon-maskable-512.png. Requires Pillow (stdlib otherwise); no network, no
fonts, no external assets — the whole motif is polygons, lines and circles.
The script is the source of truth, not the PNGs (hub CLAUDE.md §4): change the
motif here and re-run, never touch the images.

THE MOTIF: the fox — digit 1, the piece every player meets first — sitting on
a cream game tile, the tile lying on the teal meadow the board is played on,
and the tile split into four boxes by a thick ink cross with thin cell lines
inside them. It is the game in one picture: a sudoku board, starting with a
fox. The fox is the same drawing as the fox in js/animals.js (its path data is
transcribed below in that file's 100×100 viewBox), so the icon and the piece
on the board are one animal, not two.

WHAT MAKES IT LEGIBLE AT 24 px: three masses with hard value breaks.
  1. the MEADOW: teal #1f5f5b, the darkest mass, filling the frame.
  2. the TILE: cream #fff6e3, the lightest, a rounded square with a darker
     teal shadow under it like a real game piece.
  3. the FOX: orange #f28c38 with a deep-orange outline, the only saturated
     thing in the frame; at 24 px its two ears and pointed chin are what
     survive, and that silhouette is the fox.
The grid lines, the cream cheeks, the eye glints and the nose are 512-px
enrichment and are allowed to vanish at small sizes.

Rendered 4x and downsampled with LANCZOS. The palette is the game's own —
DESIGN.md §2 (the fox's colour) and §3 (the shared CSS tokens; --bg is the
manifest's background_color and theme colour).
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

# ---- palette (DESIGN.md §2/§3; must match the game) ---------------------
MEADOW = (31, 95, 91)       # --bg #1f5f5b
MEADOW_DEEP = (23, 72, 69)  # --bg-deep #174845, the tile's shadow
BOARD = (255, 246, 227)     # --board #fff6e3
INK = (46, 74, 72)          # --ink #2e4a48, grid lines and the eyes
GRID_SOFT = (222, 208, 180)  # thin cell lines: ink thinned toward the board

FOX = (242, 140, 56)        # #f28c38 (animals.js)
FOX_SH = (212, 105, 31)     # inner ears
FOX_O = (138, 63, 16)       # outline
FOX_CREAM = (255, 243, 226) # cheeks
NOSE = (58, 36, 24)
WHITE = (255, 255, 255)

SS = 4  # supersample factor


def cubic(p0, p1, p2, p3, n=24):
    """Sample a cubic bezier as n points, excluding p0 (the caller has it)."""
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


def path(start, *segs):
    """A closed outline from a start point and a list of segments: a 2-tuple
    is a straight line to that point, a 3-tuple of points is a cubic. The
    same moves as the SVG path in animals.js, so the two can be compared by
    eye."""
    pts = [start]
    for s in segs:
        if len(s) == 3 and isinstance(s[0], tuple):
            pts += cubic(pts[-1], *s)
        else:
            pts.append(s)
    return pts


# ---- the fox, in animals.js viewBox units (0..100) -----------------------
EAR_L = [(16, 48), (20, 8), (46, 30)]
EAR_R = [(84, 48), (80, 8), (54, 30)]
EAR_L_IN = [(23, 38), (25, 19), (37, 30)]
EAR_R_IN = [(77, 38), (75, 19), (63, 30)]
HEAD = path((10, 44),
            ((10, 30), (28, 25), (50, 25)),
            ((72, 25), (90, 30), (90, 44)),
            ((90, 58), (72, 72), (50, 90)),
            ((28, 72), (10, 58), (10, 44)))
CHEEKS = path((12, 50),
              ((26, 50), (40, 57), (50, 64)),
              ((60, 57), (74, 50), (88, 50)),
              ((84, 62), (68, 75), (50, 88)),
              ((32, 75), (16, 62), (12, 50)))
NOSE_PTS = path((44, 80),
                ((44, 76), (56, 76), (56, 80)),
                ((56, 84), (52, 86), (50, 86)),
                ((48, 86), (44, 84), (44, 80)))


def render(size, sq=1.0):
    """The whole icon at `size`. sq < 1 shrinks tile and fox toward the
    centre, which is how the maskable icon gets its wider safe zone; the
    meadow is drawn full-frame regardless, so every version is opaque to its
    corners."""
    S = size * SS
    img = Image.new("RGB", (S, S), MEADOW)
    d = ImageDraw.Draw(img)
    c = S / 2

    def P(u, v):
        return (c + (u - 0.5) * S * sq, c + (v - 0.5) * S * sq)

    def W(w):
        return max(1, int(round(w * S * sq)))

    # ---- the tile -------------------------------------------------------
    t0, t1, r = 0.07, 0.93, 0.14
    drop = 0.035
    a, b = P(t0, t0 + drop), P(t1, t1 + drop)
    d.rounded_rectangle([a, b], radius=r * S * sq, fill=MEADOW_DEEP)
    a, b = P(t0, t0), P(t1, t1)
    d.rounded_rectangle([a, b], radius=r * S * sq, fill=BOARD)

    # ---- the grid -------------------------------------------------------
    # A 4×4 board: thin cell lines at the quarters, a thick ink cross at the
    # half making the four 2×2 boxes. Inset from the tile's edge so they do
    # not run into its rounded corners.
    span = t1 - t0
    inset = 0.07
    lo, hi = t0 + inset, t1 - inset
    for k in (0.25, 0.75):
        x = t0 + span * k
        d.line([P(x, lo), P(x, hi)], fill=GRID_SOFT, width=W(0.012))
        d.line([P(lo, x), P(hi, x)], fill=GRID_SOFT, width=W(0.012))
    m = t0 + span * 0.5
    d.line([P(m, lo), P(m, hi)], fill=INK, width=W(0.026))
    d.line([P(lo, m), P(hi, m)], fill=INK, width=W(0.026))
    for (u, v) in ((m, lo), (m, hi), (lo, m), (hi, m)):  # round the ends
        x, y = P(u, v)
        rr = W(0.026) / 2
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=INK)

    # ---- the fox --------------------------------------------------------
    # animals.js coordinates mapped into the tile: F is how much of the frame
    # 100 viewBox units take, (50, 54) is the point that lands at the centre.
    F = 0.74

    def F2(pt):
        x, y = pt
        return P(0.5 + (x - 50) / 100 * F, 0.5 + (y - 54) / 100 * F)

    ow = W(0.045 * F)

    def shape(pts, fill, outline=None):
        q = [F2(p) for p in pts]
        d.polygon(q, fill=fill)
        if outline:
            # A centred stroke over the fill, exactly as SVG paints it, with
            # a disc at every vertex so corners join round instead of
            # cracking open (Pillow's polygon outline is thin and mitred).
            d.line(q + [q[0], q[1]], fill=outline, width=ow, joint="curve")
            rr = ow / 2
            for (x, y) in q:
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=outline)

    def dot(x, y, r, fill):
        cx, cy = F2((x, y))
        rr = r / 100 * F * S * sq
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=fill)

    shape(EAR_L, FOX, FOX_O)
    shape(EAR_R, FOX, FOX_O)
    shape(EAR_L_IN, FOX_SH)
    shape(EAR_R_IN, FOX_SH)
    shape(HEAD, FOX, FOX_O)
    shape(CHEEKS, FOX_CREAM)
    shape(NOSE_PTS, NOSE)
    for x in (35, 65):
        dot(x, 45, 5.5, INK)
        dot(x + 1.9, 43.1, 2.0, WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")):
        render(size).save(os.path.join(OUT, name))
        print("wrote", name)
    # Maskable: the same tile and fox inside a 76% box, so a circular or
    # squircle mask can take ~12% off every edge without clipping an ear.
    # The meadow fills the frame regardless, so it is opaque to its corners.
    render(512, sq=0.76).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("wrote icon-maskable-512.png")


if __name__ == "__main__":
    main()
