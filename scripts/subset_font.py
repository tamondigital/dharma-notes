#!/usr/bin/env python3
"""Subset Noto Serif TC to the characters the built site uses, after `astro build`.

Reads dist/ (page text, transcript data, scripts) and writes into dist/fonts/:
  noto-serif-tc.<hash>.woff2  the variable font holding exactly those characters
  noto-serif-tc.css           its @font-face (src/layouts/Base.astro links this path)
  OFL.txt                     the font's licence

One file serves every page, so a reader downloads it once. It is rebuilt from dist/ on every
build, so a character added to the notes is in the font on the next deploy.
Any python can start it; it re-runs itself under ./.venv when fontTools is missing there.
"""
import hashlib
import html
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


def site_text(dist: Path) -> set[str]:
    """Every character a page can show: HTML text, plus transcript JSON and scripts drawn at runtime."""
    chars = {chr(c) for c in range(0x20, 0x7F)}
    for f in dist.rglob("*.html"):
        chars |= set(html.unescape(TAG_RE.sub(" ", STRIP_RE.sub(" ", f.read_text(encoding="utf-8")))))
    for pattern in ("data/**/*.json", "scripts/*.js"):
        for f in dist.glob(pattern):
            chars |= {ch for ch in f.read_text(encoding="utf-8") if ord(ch) > 0x7F}
    return {ch for ch in chars if ch.isprintable()}


def build(chars: set[str]) -> bytes:
    font = TTFont(SOURCE, recalcTimestamp=False)
    cmap = font.getBestCmap()
    keep = "".join(sorted(ch for ch in chars if ord(ch) in cmap))
    opt = subset.Options()
    opt.flavor = "woff2"
    opt.layout_features = ["*"]
    opt.hinting = False
    opt.desubroutinize = True
    sub = subset.Subsetter(opt)
    sub.populate(text=keep)
    sub.subset(font)
    tmp = OUT / "subset.tmp"
    font.flavor = "woff2"
    font.save(tmp)
    data = tmp.read_bytes()
    tmp.unlink()
    print(f"font: {len(keep)} of {len(chars)} characters, {len(data) // 1024} KB")
    return data


def main():
    if not (DIST / "index.html").exists():
        sys.exit("dist/ not built: run astro build first")
    OUT.mkdir(parents=True, exist_ok=True)
    data = build(site_text(DIST))
    name = f"noto-serif-tc.{hashlib.sha256(data).hexdigest()[:10]}.woff2"
    for old in OUT.glob("noto-serif-tc.*.woff2"):
        old.unlink()
    (OUT / name).write_bytes(data)
    (OUT / "noto-serif-tc.css").write_text(
        f"/* {FAMILY} (SIL Open Font License 1.1, OFL.txt), subset to this site's characters */\n"
        f'@font-face{{font-family:"{FAMILY}";font-style:normal;font-weight:400 700;font-display:swap;'
        f'src:url({name}) format("woff2")}}\n', encoding="utf-8")
    shutil.copyfile(LICENCE, OUT / "OFL.txt")


if __name__ == "__main__":
    main()
