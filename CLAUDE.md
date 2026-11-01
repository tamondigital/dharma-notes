# CLAUDE.md

A static site built from the mani study notes. The notes are produced upstream in `../mani`, and `scripts/export.py` only copies and indexes them.

## Model routing

No job in this repo calls a model. `scripts/export.py` and the Astro build are deterministic. Do not add a model call here, and do not add an agent under `.claude/agents/`, without a human decision: the notes are human-approved teaching material and must stay as exported.

## Rules

- `export.py` reads `../mani` and never writes there.
- Entity pages (名相, 人物, 地名) are generated from the notes' indexes; do not hand-edit generated pages under `content/` or `public/data/`.
