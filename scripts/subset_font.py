#!/usr/bin/env python3
"""Subset Noto Serif TC to the characters the built site uses, after `astro build`.

Reads dist/ (page text, transcript data, scripts) and writes into dist/fonts/:
  noto-serif-tc.<hash>.woff2  the font at two fixed weights, 400 and 700 (the site's 600 is drawn
                              with 700), each in slices: a core of the characters most pages use,
                              then the rest in small slices, rarest last
  noto-serif-tc.css           one @font-face per weight and slice, with its unicode-range
                              (src/layouts/Base.astro links this path)
  OFL.txt                     the font's licence

The browser fetches only the slices whose characters it actually draws, and the note sections and
transcript rows off screen are not drawn (content-visibility), so a first visit loads the core and a
few slices instead of the whole font. Slices are named by their content, so an unchanged slice stays
cached across deploys. Rebuilt from dist/ on every build: a character added to the notes is in a slice
on the next deploy.
Any python can start it; it re-runs itself under ./.venv when fontTools is missing there.
"""
import hashlib
import html
import io
from collections import Counter
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_venv = ROOT / ".venv"
try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    if (_venv / "bin" / "python").exists() and Path(sys.prefix).resolve() != _venv.resolve():
        os.execv(str(_venv / "bin" / "python"), [str(_venv / "bin" / "python"), __file__, *sys.argv[1:]])
    sys.exit("fontTools not found: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt")

SOURCE = ROOT / "fonts" / "NotoSerifTC[wght].ttf"
LICENCE = ROOT / "fonts" / "OFL.txt"
DIST = ROOT / "dist"
OUT = DIST / "fonts"
FAMILY = "Noto Serif TC"
STRIP_RE = re.compile(r"<script\b.*?</script>|<style\b.*?</style>", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
CORE = 1200   # characters in the core slice: the ones on the most pages
SLICE = 600   # characters in each further slice
# fixed instances of the variable font: half the bytes of the full 200–900 axis. The 700 face also
# serves 600; a browser fetches a bold slice only for bold text.
WEIGHTS = {400: "400", 700: "500 900"}


def site_text(dist: Path) -> Counter:
    """Every character a page can show, counted by the number of pages showing it. A page's text is its
    HTML text plus, for a lesson, its transcript JSON; scripts add the strings they draw at runtime."""
    pages = Counter({chr(c): 1 for c in range(0x20, 0x7F)})
    data = dist / "data"
    for f in dist.rglob("*.html"):
        chars = set(html.unescape(TAG_RE.sub(" ", STRIP_RE.sub(" ", f.read_text(encoding="utf-8")))))
        rel = f.parent.relative_to(dist).as_posix().removesuffix("/transcript")
        if (j := data / f"{rel}.json").is_file() and j.parent != data:
            chars |= {ch for ch in j.read_text(encoding="utf-8") if ord(ch) > 0x7F}
        pages.update(chars)
    for pattern in ("data/**/*.json", "scripts/*.js"):
        for f in dist.glob(pattern):
            pages.update({ch for ch in f.read_text(encoding="utf-8") if ord(ch) > 0x7F} - pages.keys())
    return Counter({ch: n for ch, n in pages.items() if ch.isprintable()})


def slices(counts: Counter, cmap: dict) -> list[list[int]]:
    """Code points in slices: ASCII and the CORE most widely used characters first, then SLICE at a time."""
    ranked = sorted((ord(ch) for ch in counts if ord(ch) in cmap), key=lambda c: (c >= 0x7F, -counts[chr(c)], c))
    core = CORE + sum(c < 0x7F for c in ranked)
    return [ranked[:core]] + [ranked[i:i + SLICE] for i in range(core, len(ranked), SLICE)]


def instance(weight: int) -> bytes:
    """The variable font fixed at one weight, as TTF bytes to subset from."""
    font = instancer.instantiateVariableFont(TTFont(SOURCE, recalcTimestamp=False), {"wght": weight})
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def build(source: bytes, codepoints: list[int]) -> bytes:
    font = TTFont(io.BytesIO(source), recalcTimestamp=False)
    opt = subset.Options()
    opt.flavor = "woff2"
    opt.layout_features = ["*"]
    opt.hinting = False
    opt.desubroutinize = True
    sub = subset.Subsetter(opt)
    sub.populate(unicodes=codepoints)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return buf.getvalue()


def unicode_range(codepoints: list[int]) -> str:
    """U+4E00-4E05,U+4E08… from code points, runs folded into ranges."""
    out, cps = [], sorted(codepoints)
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" + (f"-{cps[j]:X}" if j > i else ""))
        i = j + 1
    return ",".join(out)


def main():
    if not (DIST / "index.html").exists():
        sys.exit("dist/ not built: run astro build first")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("noto-serif-tc.*.woff2"):
        old.unlink()
    counts = site_text(DIST)
    parts = slices(counts, TTFont(SOURCE, lazy=True).getBestCmap())
    faces, total, core_kb = [], 0, []
    for weight, css_weight in WEIGHTS.items():
        source = instance(weight)
        for i, cps in enumerate(parts):
            data = build(source, cps)
            name = f"noto-serif-tc.{hashlib.sha256(data).hexdigest()[:10]}.woff2"
            (OUT / name).write_bytes(data)
            total += len(data)
            if i == 0:
                core_kb.append(f"{weight} {len(data) // 1024} KB")
            faces.append(f'@font-face{{font-family:"{FAMILY}";font-style:normal;font-weight:{css_weight};font-display:swap;'
                         f'src:url({name}) format("woff2");unicode-range:{unicode_range(cps)}}}')
    (OUT / "noto-serif-tc.css").write_text(
        f"/* {FAMILY} (SIL Open Font License 1.1, OFL.txt), at weights 400 and 700, subset to this site's characters and sliced:\n"
        f"   the first face holds the characters most pages use; a browser fetches a face only for text it draws */\n"
        + "\n".join(faces) + "\n", encoding="utf-8")
    shutil.copyfile(LICENCE, OUT / "OFL.txt")
    print(f"font: {sum(map(len, parts))} of {len(counts)} characters in {len(parts)} slices × {len(WEIGHTS)} weights, "
          f"core {', '.join(core_kb)}, all {total // 1024} KB")


if __name__ == "__main__":
    main()
