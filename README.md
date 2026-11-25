# 講經筆記

A static site of Dharma talks: study notes (學習筆記), full transcripts (逐字稿), related talks, a 名相/人物/地名 index, a sutra index and client-side search. No database or server is needed.

## How it works

```
mani  ──scripts/export.py──▶  content/ + public/data/  ──astro build + pagefind──▶  dist/
```

### `site.config.json`

| Key | Meaning |
|---|---|
| `mani` | Path to the mani checkout, relative to this site (`../../mani`). `$MANI` or `--mani` overrides it. |
| `title` | Site name |
| `tagline` | Home-page intro |
| `channels` | Which mani channels to publish. Any channel with notes works. |
| `entity_min_talks` | A name gets its own page only if it appears in at least this many talks. |
| `entity_max_share` | A name that appears in more than this share of talks gets no page (it would just list everything). |
| `entity_stoplist` | Dictionary words that are ambiguous in these notes, such as 會通 or 法寶 being typed as people. |

### `scripts/export.py`

The exporter reads mani and never writes there. It re-runs itself under mani's venv (`pipelines/knowledgebase/.venv`).

- **Notes:** written to `content/notes/<channel>/<series>/<NN>.md`, after rewriting into the public voice (next section).
- **Per-talk data:** `content/lessons/…json` holds the verified quotes, related talks and the talk's main names.
- **Indexes:**
  - `content/sutras.json` maps each CBETA id to the talks that quote or cite it.
  - `content/entities.json` maps each 名相, 人物 and 地名 to the talks that mention it, plus a 丁福保《佛學大辭典》 gloss.
- **Transcripts:** `public/data/…json` holds the transcript lines and the line → video time map.
- **Sources:**
  - Used: only what the site publishes (notes, transcripts, verified quotes), mani's entity dictionary and the 丁福保 glosses.
  - Never read: mani's private insight graph (`insight_edges`, `圖譜.json`).

### `scripts/public_voice.py`

The teacher speaks without notes, so a quotation recalled from memory can differ from the canon in wording or source. The notes keep the canonical text and its CBETA source, but no verdict about the teacher:

- A difference is shown as a neutral **※** (原文對照), never as a mistake.
- Teacher-directed wording is rewritten, for example 法師誤稱 → 法師稱 and 出處誤植 → 出處另見.
- QA-only sections (校勘, 逐字稿瑕疵, 待覆核 lists) and verification-tool jargon are dropped.
- Machine errors (OCR) are left as written.

Every export ends by printing any line that still pairs the teacher with 誤 (`public voice? …`), so new wording can be caught and a rule added.

### `scripts/subset_font.py`

The body serif, Noto Serif TC (variable weight, `fonts/NotoSerifTC[wght].ttf`, SIL OFL in `fonts/OFL.txt`), is cut down at build time to the characters the built pages use. That makes one woff2 of about 2 MB that every page shares, written to `dist/fonts/` with its `@font-face` CSS. A new character in the notes is in the font from the next build. On a first visit the page loads the font after the page itself has loaded, and once the font is cached it is applied at once. `npm run dev` has no font file, so text shows in the fallback serif.

It needs `fontTools` (`requirements.txt`). Run once per clone: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`. The script re-runs itself under `.venv`. CI installs the same requirements.

### `scripts/build_board.py` — 白板 data

The 白板 page (`/board/`) lets a visitor put note cards on a whiteboard, expand them and find every path between two terms, all in the browser: no server, no model. `build_board.py` reads the published snapshot (`content/notes`, `content/site.json`), never mani's live notes, and writes:

- `public/data/board/index.json`: each indexed term's blocks, best first; the curated relations; the CBETA map; the lesson offsets.
- `public/data/board/b/<channel>/<series>/<NN>.json`: one lesson's blocks (note text cut on its own `〔行NNN〕`), fetched only when a card from it is shown.

Block cutting, ranking and the term vocabulary are mani's (`pipelines/knowledgebase/src/board.py`, `outputs/kb/catalog.db`, `reference/buddhist-terms/concept-relations.txt`), read-only. Only series taught by a teacher in `TEACHERS` are included (now 體佛法師). On a phone (≤ 800 px) the cards and the board each fill the screen, switched by 卡片 / 白板 tabs; the board pinch-zooms and **全部** fits every card in view; the file tools fold into **⋯**. A term outside the index is found through Pagefind, so it works after `npm run build`, not under `npm run dev`. A visitor's boards stay in their browser: localStorage keys `dharma-notes:board:current` (the board on screen, saved on every change) and `dharma-notes:board:saved` (boards saved by name). They never reach a server, are per browser and device, and are lost if the visitor clears the site's data; **下載** / **開啟檔案** move a board between devices.

### Search-engine metadata

- **Lesson pages** carry an `Article` (author and publisher: the site) with `datePublished` (the note's `generated.at`) and `dateModified` (its latest `verified` gate run). `export.py` copies both into `content/site.json` as `published` and `modified`.
- **The sitemap** gives a lesson and its transcript that date as `<lastmod>`, and a series its newest lesson's date (`astro.config.mjs`).
- **The video** shows its thumbnail, a link to YouTube, until the reader presses play. Only then does YouTube's player load (`public/scripts/player.js`).

## Commands

```sh
npm run export    # re-snapshot from mani (path in site.config.json; uses mani's venv)
npm run board     # rebuild the 白板 data from the snapshot (after every export)
npm run dev       # local dev server (no subset font: fallback serif)
npm run build     # astro build + font subset + sitemap + pagefind index → dist/
npm run preview   # serve dist/ at http://localhost:4321/dharma-notes/
npm run index:dev # after a build: copy the search index into public/ so search works under `npm run dev`
```

After `npm run export` and `npm run board`, commit `content/` and `public/data/`. CI builds from the committed snapshot.

## Routes

| Route | Page |
|---|---|
| `/` | Home: channels and their series |
| `/<channel>/<series>/` | Table of contents for a series |
| `/<channel>/<series>/<NN>/` | Note reader |
| `/<channel>/<series>/<NN>/transcript/` | Transcript |
| `/e/`, `/e/<名相\|人物\|地名>/<name>/` | Name index and name pages |
| `/sutra/`, `/sutra/<CBETA id>/` | Sutra index and sutra pages |
| `/search/` | Search |
| `/board/` | 白板: whiteboard of note cards, paths between terms (in the browser, no AI) |
| `/guide/` | Reading guide (閱讀說明) |
| `/about/` | About the project (關於本站): principles, pipeline, usage notice |
| `/sitemap-index.xml` | Sitemap |

## Deploy

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. To set it up, go to Settings → Pages and set Source to "GitHub Actions". The base path is `/dharma-notes` (see `astro.config.mjs`). The site is served at https://tiedy.com/dharma-notes/: `tiedy.com` is the custom domain of the `tamondigital.github.io` root repo, so every project site appears under it, and old github.io URLs redirect there.
