"""One-off: cut the static font weights NoPeeking uses, and outline the text the brand images need.

Python is not a project dependency. Run from the repo root in a throwaway virtualenv:

    python -m venv %TEMP%\\pc-fonts
    %TEMP%\\pc-fonts\\Scripts\\python -m pip install "fonttools[woff]==4.60.1"
    %TEMP%\\pc-fonts\\Scripts\\python -I scripts\\brand\\make-fonts.py

Everything it writes is committed, so nobody else needs to run it. Re-run it only to change fonts or outlined text.
"""
import json
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "bf7c667ae010c0ffb39944ae85097021478cb91d"  # google/fonts main on 2026-10-16
SOURCES = {  # family file stem: (folder in google/fonts/ofl, variable font file)
    "BricolageGrotesque": ("bricolagegrotesque", "BricolageGrotesque[opsz,wdth,wght].ttf"),
    "DMSans": ("dmsans", "DMSans[opsz,wght].ttf"),
    "JetBrainsMono": ("jetbrainsmono", "JetBrainsMono[wght].ttf"),
}
# (source family, output name, axis positions). Output names must match the "files" in brand/tokens.json.
# Static instances, because WPF does not pick weights out of variable fonts.
CUTS = [
    ("BricolageGrotesque", "BricolageGrotesque-ExtraBold", {"opsz": 48, "wdth": 100, "wght": 800}),
    ("DMSans", "DMSans-Regular", {"opsz": 14, "wght": 400}),
    ("DMSans", "DMSans-Medium", {"opsz": 14, "wght": 500}),
    ("DMSans", "DMSans-Bold", {"opsz": 14, "wght": 700}),
    ("JetBrainsMono", "JetBrainsMono-Medium", {"wght": 500}),
    ("JetBrainsMono", "JetBrainsMono-Bold", {"wght": 700}),
]
# key in outlines.json: (static font, text, letter-spacing in em). Kerning is not applied.
OUTLINES = {
    "wordmark": ("BricolageGrotesque-ExtraBold", "NoPeeking", -0.035),
    "tagline1": ("BricolageGrotesque-ExtraBold", "Claude logs you in.", -0.045),
    "tagline2": ("BricolageGrotesque-ExtraBold", "Its eyes stay shut.", -0.045),
    "footnote": ("DMSans-Medium", "Add-on for Claude Code on Windows", 0),
}


def fetch(folder, file):
    url = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/{folder}/{urllib.parse.quote(file, safe=',')}"
    with urllib.request.urlopen(url) as response:
        return response.read()


def outline(font, text, tracking):
    cmap, glyphs, upm = font.getBestCmap(), font.getGlyphSet(), font["head"].unitsPerEm
    svg, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    x = 0
    for ch in text:
        name = cmap[ord(ch)]
        for pen in (svg, bounds):
            glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))  # font y grows up, SVG y grows down
        x += font["hmtx"][name][0] + tracking * upm
    box = [round(v, 1) for v in bounds.bounds]
    return {"text": text, "unitsPerEm": upm, "d": svg.getCommands(), "box": box}


def main():
    assets, web, build = ROOT / "assets" / "fonts", ROOT / "brand" / "web" / "fonts", ROOT / "brand" / "build"
    for folder in (assets, web, build):
        folder.mkdir(parents=True, exist_ok=True)
    variable = {}
    for family, (folder, file) in SOURCES.items():
        variable[family] = fetch(folder, file)
        licence = fetch(folder, "OFL.txt")
        for out in (assets, web):
            (out / f"OFL-{family}.txt").write_bytes(licence)
    statics = {}
    for family, name, axes in CUTS:
        font = instantiateVariableFont(TTFont(BytesIO(variable[family])), axes, updateFontNames=True)
        font.save(assets / f"{name}.ttf")
        font.flavor = "woff2"
        font.save(web / f"{name}.woff2")
        statics[name] = TTFont(assets / f"{name}.ttf")
        print("wrote", name)
    outlines = {key: outline(statics[f], text, tr) for key, (f, text, tr) in OUTLINES.items()}
    (build / "outlines.json").write_text(json.dumps(outlines, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("wrote brand/build/outlines.json")


if __name__ == "__main__":
    main()
