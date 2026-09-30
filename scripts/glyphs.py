"""Turns words into SVG outlines from a font file, for scripts/brand.mjs.

    python3 scripts/glyphs.py FONT.ttf "Wiki" "Remastered" > scripts/brand-glyphs.json
    python3 scripts/glyphs.py --gpos FONT.ttf "WIKI" "MASTERS" > scripts/pack-green-glyphs.json

Needs fontTools (pip install fonttools). The logo is drawn from these outlines, not from the
font: the SVG is shown as an image, and an image only ever sees the system's fonts.
Each glyph is placed by its advance, plus the font's pair kerning when it has a `kern` table (or,
with --gpos, the pair adjustments of its GPOS `kern` feature).
Units: the font's own, y down, baseline at 0.
"""

import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def gpos_kerning(font):
    """Pair adjustments of the GPOS 'kern' feature (formats 1 and 2), as {(left, right): value}."""
    pairs = {}
    if "GPOS" not in font or not font["GPOS"].table.FeatureList:
        return pairs
    table = font["GPOS"].table
    lookups = set()
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag == "kern":
            lookups.update(record.Feature.LookupListIndex)
    order = font.getGlyphOrder()
    for index in sorted(lookups):
        lookup = table.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if getattr(sub, "LookupType", 2) != 2 and lookup.LookupType not in (2, 9):
                continue
            firsts = sub.Coverage.glyphs
            if sub.Format == 1:
                for first, pair_set in zip(firsts, sub.PairSet):
                    for record in pair_set.PairValueRecord:
                        value = getattr(record.Value1, "XAdvance", 0) if record.Value1 else 0
                        pairs.setdefault((first, record.SecondGlyph), value)
            elif sub.Format == 2:
                class1 = sub.ClassDef1.classDefs
                class2 = sub.ClassDef2.classDefs
                for first in firsts:
                    c1 = class1.get(first, 0)
                    row = sub.Class1Record[c1].Class2Record
                    for second in order:
                        c2 = class2.get(second, 0)
                        value = getattr(row[c2].Value1, "XAdvance", 0) if row[c2].Value1 else 0
                        if value:
                            pairs.setdefault((first, second), value)
    return pairs


def outline(font, text, gpos=False):
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    kern = {}
    if "kern" in font:
        for table in font["kern"].kernTables:
            kern.update(getattr(table, "kernTable", {}))
    elif gpos:
        kern = gpos_kerning(font)
    x = 0
    parts = []
    previous = None
    bounds = BoundsPen(glyphs)
    for char in text:
        name = cmap[ord(char)]
        if previous is not None:
            x += kern.get((previous, name), 0)
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, -1, x, 0)))
        parts.append(pen.getCommands())
        x += glyphs[name].width
        previous = name
    # The box of the ink, y down: [left, top, right, bottom].
    return {"text": text, "d": " ".join(part for part in parts if part), "width": x, "box": list(bounds.bounds or (0, 0, 0, 0))}


def main():
    # --gpos: also apply the pair kerning of a font that keeps it in GPOS (off by default, so the
    # logo's outlines, made without it, do not change).
    gpos = "--gpos" in sys.argv
    args = [arg for arg in sys.argv[1:] if arg != "--gpos"]
    font = TTFont(args[0])
    os2 = font["OS/2"]
    result = {
        "font": font["name"].getDebugName(4),
        "unitsPerEm": font["head"].unitsPerEm,
        "capHeight": getattr(os2, "sCapHeight", 0) or font["head"].unitsPerEm * 0.7,
        "xHeight": getattr(os2, "sxHeight", 0) or font["head"].unitsPerEm * 0.5,
        "descender": font["hhea"].descent,
        "words": [outline(font, text, gpos) for text in args[1:]],
    }
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
