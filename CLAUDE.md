# CLAUDE.md

A static site built from the mani study notes. The notes are produced upstream in `../../mani`, and `scripts/export.py` only copies and indexes them.

## Model routing

No job in this repo calls a model. `scripts/export.py` and the Astro build are deterministic. Do not add a model call here, and do not add an agent under `.claude/agents/`, without a human decision: the notes are human-approved teaching material and must stay as exported.

## Rules

- `export.py` reads `../../mani` and never writes there.
- `build_board.py` reads the snapshot in `content/` (and mani's block cutter and term list, read-only) and writes only `public/data/board/`; regenerate it after every export. The 白板 page runs entirely in the browser — never add a model call or a server to it.
- Entity pages (名相, 人物, 地名) are generated from the notes' indexes; do not hand-edit generated pages under `content/` or `public/data/`.
- Look: tokens, base, header, page widths and pills come from the shared tiedy theme (`../tamondigital.github.io/theme/`). `src/styles/theme/` and `public/theme/` are synced copies (`npm run theme`) — edit the theme, never the copies. `src/styles/site.css` holds only notes-specific rules. The phone-menu, light/dark and text-size code stays inline in `Base.astro`: the theme's `chrome.js` also highlights the 目次, which `public/scripts/reader.js` already does with the player in mind.
