"""白板 data for the static whiteboard page: blocks cut from the published notes, plus a term index.

Reads the site's own snapshot (content/notes, content/site.json) — never mani's live notes, so the
board holds exactly what is published. Block cutting and ranking are mani's
(pipelines/knowledgebase/src/board.py), imported read-only; the concept vocabulary and curated
relations come from mani's catalog.db and reference/buddhist-terms/concept-relations.txt.

Writes public/data/board/index.json and public/data/board/b/<ch>/<series>/<NN>.json.
Only series whose teacher is in TEACHERS are included.

Usage: python3 scripts/build_board.py [--mani PATH]   (any python; it re-runs under mani's venv)
"""
import json
import os
import shutil
import sqlite3
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
OUT = SITE / "public" / "data" / "board"
TEACHERS = ("體佛法師",)


def mani_root() -> Path:
    if "--mani" in sys.argv:
        return Path(sys.argv[sys.argv.index("--mani") + 1]).resolve()
    cfg = json.loads((SITE / "site.config.json").read_text(encoding="utf-8"))
    return (SITE / cfg["mani"]).resolve()


def main():
    mani = mani_root()
    venv = mani / "pipelines" / "knowledgebase" / ".venv"
    if Path(sys.prefix).resolve() != venv.resolve():      # mani's modules need mani's venv
        if not (venv / "bin" / "python").exists():
            sys.exit(f"mani venv not found: {venv}")
        os.execv(str(venv / "bin" / "python"), [str(venv / "bin" / "python"), __file__, *sys.argv[1:]])
    sys.path.insert(0, str(mani / "pipelines" / "knowledgebase"))
    from src import board, note_parser   # noqa: E402  (mani's, read-only)

    site = json.loads((SITE / "content" / "site.json").read_text(encoding="utf-8"))
    units, lessons = [], []
    for ch in site["channels"]:
        for se in ch["series"]:
            teacher = (se.get("teacher") or "").split("（")[0]
            if teacher not in TEACHERS:
                continue
            for les in se["lessons"]:
                f = SITE / "content" / "notes" / ch["slug"] / se["slug"] / f"{les['no']}.md"
                if not les.get("has_note") or not f.exists():
                    continue
                parsed = note_parser.parse_note(f)
                parsed.update(key=f"{ch['slug']}/{se['slug']}/{les['no']}", channel=ch["slug"],
                              playlist=se["slug"], lesson=les["no"])
                us = board.units_from_parsed(parsed, teacher)
                lessons.append({"ch": ch["slug"], "s": se["slug"], "no": les["no"],
                                "title": les.get("title") or "", "off": len(units), "n": len(us)})
                units += us

    con = sqlite3.connect(f"file:{mani / 'outputs/kb/catalog.db'}?mode=ro", uri=True)
    rows = con.execute("SELECT type, name FROM entities").fetchall()
    con.close()
    relations = board.load_relations(mani / "reference/buddhist-terms/concept-relations.txt")
    concepts = [n for t, n in rows if t == "concept"] + list(relations)
    idx = board.Index(units, concepts, relations, not_concepts=[n for t, n in rows if t != "concept"])

    gid = {u["id"]: i for i, u in enumerate(units)}
    post: dict = {}
    for u in units:
        for c in idx.concepts_in(u["text"], limit=60):
            post.setdefault(c, []).append(gid[u["id"]])
    # each posting list best-first, so the page ranks a term without reading any text
    for c, ids in post.items():
        ids.sort(key=lambda i: (-idx.score(units[i], [c]), i))
    related = {}
    for c in post:
        r = [x for x in idx.related(c) if x["name"] in post]
        if r:
            related[c] = r
    cbeta: dict = {}
    for i, u in enumerate(units):
        for c in u["cbeta"]:
            cbeta.setdefault(c, []).append(i)

    if OUT.exists():
        shutil.rmtree(OUT)
    for les in lessons:
        d = OUT / "b" / les["ch"] / les["s"]
        d.mkdir(parents=True, exist_ok=True)
        blocks = [{"t": u["title"], "x": u["text"], "c": u["cites"], "cb": u["cbeta"], "k": u["kind"],
                   "s": u["section"], "st": u["section_title"]}
                  for u in units[les["off"]: les["off"] + les["n"]]]
        (d / f"{les['no']}.json").write_text(json.dumps(blocks, ensure_ascii=False, separators=(",", ":")),
                                            encoding="utf-8")
    index = {"schema": "board-index/v1", "teacher": list(TEACHERS), "blocks": len(units),
             "lessons": lessons, "post": post, "related": related, "cbeta": cbeta}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
    print(f"board: {len(lessons)} lessons, {len(units)} blocks, {len(post)} terms, "
          f"{len(related)} with curated relations → {OUT.relative_to(SITE)}")


if __name__ == "__main__":
    main()
