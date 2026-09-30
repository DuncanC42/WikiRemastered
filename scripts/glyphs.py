"""Turns words into SVG outlines from a font file, for scripts/brand.mjs.

    python3 scripts/glyphs.py FONT.ttf "Wiki" "Remastered" > scripts/brand-glyphs.json

Needs fontTools (pip install fonttools). The logo is drawn from these outlines, not from the
font: the SVG is shown as an image, and an image only ever sees the system's fonts.
Each glyph is placed by its advance, plus the font's pair kerning when it has a `kern` table.
Units: the font's own, y down, baseline at 0.
"""

import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def outline(font, text):
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    kern = {}
    if "kern" in font:
        for table in font["kern"].kernTables:
            kern.update(getattr(table, "kernTable", {}))
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
    font = TTFont(sys.argv[1])
    os2 = font["OS/2"]
    result = {
        "font": font["name"].getDebugName(4),
        "unitsPerEm": font["head"].unitsPerEm,
        "capHeight": getattr(os2, "sCapHeight", 0) or font["head"].unitsPerEm * 0.7,
        "xHeight": getattr(os2, "sxHeight", 0) or font["head"].unitsPerEm * 0.5,
        "descender": font["hhea"].descent,
        "words": [outline(font, text) for text in sys.argv[2:]],
    }
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
