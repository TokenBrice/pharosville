#!/usr/bin/env python3
"""EB Garamond subsets: the signs the UI sets, drawn from each face's own outlines.

Provenance. public/fonts/eb-garamond-{400,600,400-italic}-latin.woff2 are Google Fonts' "latin" subsets of
EB Garamond 1.003 (Octavio Pardo's EBGaramond12 project, SIL OFL; name ID 3 "1.003;PfEd;EBGaramond-..."),
committed in 5a187df2 without a source or a script. The full font is not in the repository and is not fetched:
every glyph this script adds is built from glyphs the subset already carries, by rotation and translation
only, so each sign keeps the face's own drawing, weight and spacing.

  U+2190 U+2192 U+2197  left, right, north-east arrows: the face's up arrow turned +90 / -90 / -45 degrees about
                        its centre, set on the math axis (the minus sign's centre) between the up arrow's bearings
  U+22EF                midline ellipsis: the ellipsis raised as far as the centred dot (italic: along the slant)
  U+2248                almost equal: two tildes on the math axis, as far apart as the two bars of =
  U+2264 U+2265         less/greater or equal: < and > over the lower bar of =, at the bar spacing of =, centred
                        on the math axis (the relations stack upright and take the advance of =, as = does)

Not derivable, so not added (the --pv-serif stack draws them): the dagger U+2020 and the tugrik U+20AE.

Idempotent and deterministic: the glyphs a previous run appended are removed first and the head timestamp is
kept, so a second run rewrites the same bytes. Built with fontTools 4.68.0 and brotli 1.2.1.

Usage: python3 scripts/harbour/build-fonts.py [font.woff2 ...]   (default: the three files in public/fonts)
"""
import math
import sys
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

FONTS = Path(__file__).resolve().parents[2] / "public" / "fonts"
FACES = ("eb-garamond-400-latin.woff2", "eb-garamond-600-latin.woff2", "eb-garamond-400-italic-latin.woff2")
# glyph name -> code point, in the order the glyphs are appended
SIGNS = {"arrowleft": 0x2190, "arrowright": 0x2192, "uni2197": 0x2197, "uni22EF": 0x22EF,
         "approxequal": 0x2248, "lessequal": 0x2264, "greaterequal": 0x2265}


def drop_previous(font):
    """Remove the signs a previous run appended (always the tail of the glyph order)."""
    order = font.getGlyphOrder()
    keep = len(order)
    while keep and order[keep - 1] in SIGNS:
        keep -= 1
    gone = set(order[keep:])
    glyf, hmtx, classes = font["glyf"], font["hmtx"], font["GDEF"].table.GlyphClassDef.classDefs
    for name in gone:
        del glyf.glyphs[name], hmtx.metrics[name]
        classes.pop(name, None)
    for table in font["cmap"].tables:
        for code in [c for c, n in table.cmap.items() if n in gone]:
            del table.cmap[code]
    glyf.glyphOrder = order[:keep]
    font.setGlyphOrder(order[:keep])


def build(font):
    glyf, hmtx, glyphs = font["glyf"], font["hmtx"], font.getGlyphSet()
    slant = math.tan(math.radians(-font["post"].italicAngle))

    def bounds(glyph):
        glyph.recalcBounds(glyf)
        return glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax

    def draw(parts, components=False):
        """parts: [(glyph name or recorded contour, affine)] drawn into one glyph; translated components kept if asked."""
        pen = TTGlyphPen(glyphs if components else None)
        for source, matrix in parts:
            if isinstance(source, str):
                glyphs[source].draw(TransformPen(pen, matrix))
            else:
                source.replay(TransformPen(pen, matrix))
        return pen.glyph()

    def add(name, glyph, advance):
        bounds(glyph)
        glyf[name] = glyph
        hmtx[name] = (advance, glyph.xMin)
        font["GDEF"].table.GlyphClassDef.classDefs[name] = 1
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[SIGNS[name]] = name

    _, my0, _, my1 = bounds(glyf["minus"])
    axis = (my0 + my1) / 2

    # arrows: the up arrow turned about its centre, then set on the math axis between the up arrow's side bearings
    ax0, ay0, ax1, ay1 = bounds(glyf["arrowup"])
    acx, acy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
    bearing = (hmtx["arrowup"][0] - (ax1 - ax0)) / 2
    for name, degrees in (("arrowleft", 90), ("arrowright", -90), ("uni2197", -45)):
        c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
        turn = (c, s, -s, c, acx - (c * acx - s * acy), acy - (s * acx + c * acy))
        x0, y0, x1, y1 = bounds(draw([("arrowup", turn)]))
        moved = turn[:4] + (turn[4] + bearing - x0, turn[5] + axis - (y0 + y1) / 2)
        add(name, draw([("arrowup", moved)]), round(x1 - x0 + 2 * bearing))

    # midline ellipsis: the ellipsis raised as far as the centred dot stands above the period
    rise = glyf["periodcentered"].components[0].y
    add("uni22EF", draw([("ellipsis", (1, 0, 0, 1, round(rise * slant), rise))], components=True), hmtx["ellipsis"][0])

    # the = sign: its bar spacing, and its lower bar as a contour of its own
    record, contours, contour = RecordingPen(), [], RecordingPen()
    glyphs["equal"].draw(record)
    for op, args in record.value:
        getattr(contour, op)(*args)
        if op in ("closePath", "endPath"):
            contours.append(contour)
            contour = RecordingPen()
    coords, ends, _ = glyf["equal"].getCoordinates(glyf)
    starts = [0] + [end + 1 for end in ends[:-1]]
    bars = sorted(((list(coords[s:e + 1]), k) for k, (s, e) in enumerate(zip(starts, ends))), key=lambda b: min(y for _, y in b[0]))
    (low, low_k), (high, _) = bars
    by0, by1 = min(y for _, y in low), max(y for _, y in low)
    bar_h = by1 - by0
    gap = min(y for _, y in high) - by1
    half = (min(y for _, y in high) + max(y for _, y in high) - by0 - by1) / 4
    ex0, _, ex1, _ = bounds(glyf["equal"])
    ecx = (ex0 + ex1) / 2

    # The relations below stack upright, as = does in every face (its bars share their x in the italic too), and
    # take the advance of =.
    # almost equal: two tildes where = stands, half its bar spacing above and below the math axis
    tx0, ty0, tx1, ty1 = bounds(glyf["asciitilde"])
    tcx, tcy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    add("approxequal", draw([("asciitilde", (1, 0, 0, 1, round(ecx - tcx), round(y - tcy))) for y in (axis + half, axis - half)],
                            components=True), hmtx["equal"][0])

    # less/greater or equal: the angle over the lower bar of =, as far apart as the bars of =, centred on the axis
    for name, angle in (("lessequal", "less"), ("greaterequal", "greater")):
        lx0, ly0, lx1, ly1 = bounds(glyf[angle])
        bottom = axis - ((ly1 - ly0) + gap + bar_h) / 2
        add(name, draw([(angle, (1, 0, 0, 1, round(ecx - (lx0 + lx1) / 2), round(bottom + bar_h + gap - ly0))),
                        (contours[low_k], (1, 0, 0, 1, 0, round(bottom - by0)))]), hmtx["equal"][0])

    font.setGlyphOrder(list(glyf.glyphOrder))


def main(paths):
    for path in paths:
        font = TTFont(path, recalcTimestamp=False)
        before = path.stat().st_size
        drop_previous(font)
        native = [f"U+{c:04X}" for c in SIGNS.values() if c in font.getBestCmap()]
        if native:
            sys.exit(f"{path.name} already maps {', '.join(native)}: subset those from the full font instead")
        build(font)
        font.flavor = "woff2"
        font.save(path)
        print(f"{path.name}: {before} -> {path.stat().st_size} B, {len(font.getGlyphOrder())} glyphs, {len(font.getBestCmap())} code points")


if __name__ == "__main__":
    main([Path(p) for p in sys.argv[1:]] or [FONTS / f for f in FACES])
