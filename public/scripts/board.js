// 白板: a whiteboard over the published notes, entirely in the browser — no server, no AI.
//
// data/board/index.json (scripts/build_board.py) holds every indexed term's blocks, best first,
// the curated relations and the CBETA map; a lesson's block text is fetched only when shown
// (data/board/b/<ch>/<series>/<NN>.json). A term outside the index is found through Pagefind,
// then confirmed in the lesson's own text. Card text is the note's; 我的節點 holds the visitor's
// own words. Boards live in this browser (localStorage) and can be downloaded and reopened.

const me = document.querySelector("script[data-board]");
const BASE = me.dataset.base;                       // e.g. /dharma-notes/
const PF = me.dataset.pagefind;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const W = 300, GAP = 110, LANE_H = 420, PER_LESSON = 2, MINE = "my:";
// GitHub Pages shares one origin across tamondigital.github.io sites: keys carry the site name
const STORE = "dharma-notes:board:current", SAVED = "dharma-notes:board:saved";

let IX, N;                                           // index, block count
const lessonCache = new Map(), linesCache = new Map(), termCache = new Map();
let gidTerms = null;                                 // gid → [terms], built on first need

// ---------- data ----------
async function getJSON(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
function lessonOf(g) {                               // binary search on offsets
  let lo = 0, hi = IX.lessons.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (IX.lessons[m].off <= g) lo = m; else hi = m - 1; }
  return IX.lessons[lo];
}
async function lessonBlocks(L) {
  const k = `${L.ch}/${L.s}/${L.no}`;
  if (!lessonCache.has(k)) lessonCache.set(k, getJSON(`data/board/b/${k}.json`));
  return lessonCache.get(k);
}
async function block(g) {
  const L = lessonOf(g);
  const b = (await lessonBlocks(L))[g - L.off];
  return { ...b, sec: b.s, id: "b" + g, g, ch: L.ch, s: L.s, no: L.no, lessonTitle: L.title };   // b.s is the section
}
const blocks = (gs) => Promise.all(gs.map(block));
function termsOfBlocks() {
  if (!gidTerms) {
    gidTerms = new Map();
    for (const [t, gs] of Object.entries(IX.post)) for (const g of gs) {
      if (!gidTerms.has(g)) gidTerms.set(g, []);
      gidTerms.get(g).push(t);
    }
  }
  return gidTerms;
}

// A term's blocks, best first: the index, else Pagefind → those lessons' text.
let pf = null;
async function posting(term) {
  if (IX.post[term]) return IX.post[term];
  if (termCache.has(term)) return termCache.get(term);
  const found = [];
  try {
    pf = pf || await import(PF);
    const res = await pf.search(term.replace(/([㐀-鿿])(?=[㐀-鿿])/g, "$1 "));
    const seen = new Set();
    for (const r of res.results.slice(0, 60)) {
      const d = await r.data();
      const m = decodeURI(d.url).match(/\/([^/]+)\/([^/]+)\/(\d+)\//);
      if (!m) continue;
      const L = IX.lessons.find((x) => x.ch === m[1] && x.s === m[2] && x.no === m[3]);
      if (!L || seen.has(L)) continue;
      seen.add(L);
      (await lessonBlocks(L)).forEach((b, i) => {
        const n = b.x.split(term).length - 1;
        if (n) found.push([n + (b.t.includes(term) ? 5 : 0), L.off + i]);
      });
    }
  } catch (e) { /* no Pagefind under `npm run dev`: the index alone answers */ }
  const out = found.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
  termCache.set(term, out);
  return out;
}
function rankOf(list) { const m = new Map(); list.forEach((g, i) => m.set(g, i)); return m; }

function termsFor(q) {
  q = q.trim();
  const parts = q.split(/[\s,，、]+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p.length <= 8)) return parts;
  if (q.length <= 6) return q ? [q] : [];
  const found = [], taken = [];
  for (const t of Object.keys(IX.post).sort((a, b) => b.length - a.length)) {
    if (q.includes(t) && !taken.some((x) => x.includes(t))) { found.push(t); taken.push(t); }
  }
  found.sort((a, b) => q.indexOf(a) - q.indexOf(b));
  return found.length ? found.slice(0, 4) : [q];
}

// best-first blocks holding every term, at most PER_LESSON per lesson
async function search(terms, limit = 24, exclude = new Set()) {
  const lists = await Promise.all(terms.map(posting));
  const ranks = lists.map(rankOf);
  let gs = lists[0].filter((g) => ranks.every((r) => r.has(g)));
  if (terms.length > 1) gs.sort((a, b) => ranks.reduce((s, r) => s + r.get(a), 0) - ranks.reduce((s, r) => s + r.get(b), 0));
  const per = new Map(), out = [];
  for (const g of gs) {
    if (exclude.has(g)) continue;
    const L = lessonOf(g), k = L.off;
    if ((per.get(k) || 0) >= PER_LESSON) continue;
    per.set(k, (per.get(k) || 0) + 1);
    out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

async function expand(g, focus) {
  const L = lessonOf(g), b = await block(g), groups = [];
  const used = new Set([g]);
  const ctx = [g - 1, g + 1].filter((x) => x >= L.off && x < L.off + L.n);
  if (ctx.length) { groups.push({ label: "同講前後", gs: ctx }); ctx.forEach((x) => used.add(x)); }
  const fr = focus[0] ? rankOf(await posting(focus[0])) : new Map();
  const canon = [];
  for (const c of b.cb) for (const x of (IX.cbeta[c] || [])) {
    if (!used.has(x) && lessonOf(x) !== L && !canon.includes(x)) canon.push(x);
  }
  canon.sort((a, z) => (fr.get(a) ?? 1e9) - (fr.get(z) ?? 1e9));
  if (canon.length) { groups.push({ label: "同一經證", gs: canon.slice(0, 6) }); canon.slice(0, 6).forEach((x) => used.add(x)); }
  if (focus[0]) {
    const other = (await search(focus, 12, used)).filter((x) => lessonOf(x) !== L).slice(0, 6);
    if (other.length) groups.push({ label: "他講同義", gs: other });
  }
  const named = new Set(focus), concepts = [];
  for (const r of (IX.related[focus[0]] || [])) { concepts.push({ name: r.name, kind: r.kind }); named.add(r.name); }
  for (const t of (termsOfBlocks().get(g) || [])) if (!named.has(t)) { concepts.push({ name: t }); named.add(t); }
  return { b, groups, concepts: concepts.slice(0, 12) };
}

// ---------- paths: every chain from a to b; each hop is a block holding both neighbours ----------
const idf = (t) => Math.log((N + 1) / ((IX.post[t] || []).length + 1));
async function viaTerms(term, other, top) {
  const counts = new Map(), gt = termsOfBlocks();
  for (const g of (await posting(term)).slice(0, 300)) for (const c of (gt.get(g) || [])) {
    if (c.includes(term) || term.includes(c) || c.includes(other) || other.includes(c)) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1]).slice(0, top));
}
async function bestWith(terms, exclude) {
  const lists = await Promise.all(terms.map(posting)), ranks = lists.map(rankOf);
  let best = null, bs = Infinity;
  for (const g of lists[0]) {
    if (exclude.has(g) || !ranks.every((r) => r.has(g))) continue;
    const s = ranks.reduce((a, r) => a + r.get(g), 0);
    if (s < bs) { bs = s; best = g; }
  }
  return best;
}
async function paths(a, b, limit = 8) {
  const [pa, pb] = await Promise.all([posting(a), posting(b)]);
  const missing = [[a, pa], [b, pb]].filter(([, p]) => !p.length).map(([t]) => t);
  if (missing.length) return { a, b, paths: [], missing };
  const out = [], key = new Set(), vias = new Set();
  const add = (gs, v, score) => { const k = gs.join(","); if (!key.has(k)) { key.add(k); out.push({ gs, vias: v, score }); } };
  for (const g of await search([a, b], 2)) add([g], [a, b], 100);
  const ca = await viaTerms(a, b, 60), cb = await viaTerms(b, a, 60);
  const two = [...ca.keys()].filter((c) => cb.has(c))
    .map((c) => [Math.min(ca.get(c), cb.get(c)) * idf(c), c]).sort((x, y) => y[0] - x[0]);
  for (const [sc, c] of two.slice(0, limit * 2)) {
    const g1 = await bestWith([a, c], new Set());
    const g2 = g1 == null ? null : await bestWith([c, b], new Set([g1]));
    if (g1 != null && g2 != null) { add([g1, g2], [a, c, b], 50 + sc); vias.add(c); }
    if (out.length >= limit) break;
  }
  if (out.length < limit) {
    const la = [...ca.keys()].filter((c) => !vias.has(c)).slice(0, 15);
    const lb = [...cb.keys()].filter((c) => !vias.has(c)).slice(0, 15);
    const pairs = [];
    for (const c1 of la) {
      const s1 = new Set(IX.post[c1] || []);
      for (const c2 of lb) {
        if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) continue;
        const n = (IX.post[c2] || []).filter((g) => s1.has(g)).length;
        if (n) pairs.push([Math.min(ca.get(c1), cb.get(c2), n) * idf(c1) * idf(c2), c1, c2]);
      }
    }
    pairs.sort((x, y) => y[0] - x[0]);
    for (const [sc, c1, c2] of pairs) {
      const g1 = await bestWith([a, c1], new Set());
      const g2 = g1 == null ? null : await bestWith([c1, c2], new Set([g1]));
      const g3 = g2 == null ? null : await bestWith([c2, b], new Set([g1, g2]));
      if (g3 != null) add([g1, g2, g3], [a, c1, c2, b], sc);
      if (out.length >= limit) break;
    }
  }
  out.sort((x, y) => x.gs.length - y.gs.length || y.score - x.score);
  return { a, b, paths: out.slice(0, limit), missing: [] };
}

// ---------- rendering ----------
const noteUrl = (b) => `${BASE}${b.ch}/${b.s}/${b.no}/`;
const txUrl = (b, n) => `${BASE}${b.ch}/${b.s}/${b.no}/transcript/#L${n}`;
function inline(t, b) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/〔行(\d+)([^〕]*)〕/g, (m, n, rest) => b && b.ch
      ? `<a class="bcite" href="${txUrl(b, n)}" target="_blank" rel="noopener">〔行${n}${rest}〕</a>` : `<span class="bcite">${m}</span>`)
    .replace(/(✓\s*CBETA\s*[A-Z]\d{3,4})/g, '<span class="bok">$1</span>');
}
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
function body(b) {
  if (b.k === "table_row") {
    const [h, r] = b.x.split("\n"), hs = cells(h), rs = cells(r || "");
    const strip = (t) => t.replace(/\*\*|〔行[^〕]*〕/g, "").trim();
    return rs.map((c, i) => c && c !== "—" && !(i === 0 && strip(c) === strip(b.t))
      ? `<div class="kv"><span class="k">${inline(hs[i] || "", b)}</span>${inline(c, b)}</div>` : "").join("");
  }
  if (b.k === "diagram") return `<pre class="bdiag">${esc(b.x.replace(/^```\w*\n?|```$/gm, ""))}</pre>`;
  if (b.k === "canon_quote") return `<blockquote>${inline(b.x.replace(/^>\s?/gm, ""), b)}</blockquote>`;
  return b.x.split("\n").map((l) => `<p>${inline(l.replace(/^\s*[-*+]\s/, "• "), b)}</p>`).join("");
}
const src = (b) => `<span class="bsrc">《${esc(b.s)}》第${esc(b.no)}講</span>`;
const mini = (b, action) => `<div class="bmini" draggable="true" data-id="${b.id}">
  <div class="bm-hd">${src(b)}</div><div class="bm-t">${inline(b.t || b.st, b)}</div>
  <div class="bm-x">${body(b)}</div><div class="bm-ft">${action}</div></div>`;

// ---------- board state ----------
const S = { cards: [], links: [], pan: { x: 40, y: 40, k: 1 }, sel: null, focus: [] };
const known = new Map();                             // id → block shown anywhere
const el = {};
let zTop = 1, lastPaths = null;

function save() { try { localStorage.setItem(STORE, JSON.stringify({ cards: S.cards, links: S.links })); } catch (e) {} }
const cardEl = (id) => el.world.querySelector(`.bcard[data-id="${CSS.escape(id)}"]`);
function box(c) { const d = cardEl(c.id); return { l: c.x, r: c.x + W, t: c.y, b: c.y + (d ? d.offsetHeight : 120), cx: c.x + W / 2 }; }

function drawCard(c, animate) {
  const d = document.createElement("div");
  d.className = "bcard" + (animate ? " appear" : "") + (c.block.kind === "mine" ? " mine" : "");
  d.dataset.id = c.id;
  Object.assign(d.style, { left: c.x + "px", top: c.y + "px", width: W + "px" });
  const b = c.block;
  if (b.kind === "mine") {
    d.innerHTML = `<div class="bc-hd"><span class="bc-grip">⠿</span><span class="mine-tag">我的節點</span><span class="bc-x" title="移除">✕</span></div>
      <div class="bc-t">${esc(b.t)}</div>
      <div class="bc-body bc-mine" contenteditable="plaintext-only" data-placeholder="寫下你對「${esc(b.t)}」的理解…">${esc(b.x || "")}</div>`;
    d.querySelector(".bc-mine").addEventListener("input", (e) => { b.x = e.target.innerText; save(); });
  } else {
    d.innerHTML = `<div class="bc-hd"><span class="bc-grip">⠿</span>${src(b)}<span class="bc-x" title="移除">✕</span></div>
      <div class="bc-t">${inline(b.t || b.st, b)}</div><div class="bc-body">${body(b)}</div>
      <div class="bc-ft"><a class="bc-src">原文</a> · <a href="${noteUrl(b)}" target="_blank" rel="noopener">筆記</a></div>`;
  }
  el.world.appendChild(d);
}
function addCard(b, x, y, animate = true) {
  const have = S.cards.find((c) => c.id === b.id);
  if (have) return have;
  const c = { id: b.id, x, y, block: b };
  S.cards.push(c); known.set(b.id, b);
  drawCard(c, animate); save();
  return c;
}
function link(from, to, label = "") {
  if (from !== to && !S.links.some((l) => l.from === from && l.to === to)) { S.links.push({ from, to, label }); save(); }
}
function anchors(a, b) {
  const A = box(a), B = box(b);
  if (B.t >= A.b || A.t >= B.b) {
    const down = B.t >= A.b;
    return { p: { x: A.cx, y: down ? A.b : A.t }, q: { x: B.cx, y: down ? B.t : B.b }, v: true };
  }
  const right = B.l >= A.r;
  return { p: { x: right ? A.r : A.l, y: (A.t + A.b) / 2 }, q: { x: right ? B.l : B.r, y: (B.t + B.b) / 2 }, v: false };
}
function drawLinks() {
  const ps = [], ls = [];
  for (const l of S.links) {
    const a = S.cards.find((c) => c.id === l.from), b = S.cards.find((c) => c.id === l.to);
    if (!a || !b) continue;
    const { p, q, v } = anchors(a, b), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    ps.push(`<path class="blink" d="${v ? `M${p.x},${p.y} C${p.x},${my} ${q.x},${my} ${q.x},${q.y}` : `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`}"/>`);
    if (l.label) ls.push(`<div class="blabel" style="left:${mx}px;top:${my}px">${esc(l.label)}</div>`);
  }
  el.svg.innerHTML = ps.join(""); el.labels.innerHTML = ls.join("");
}
function redraw() { el.world.querySelectorAll(".bcard").forEach((n) => n.remove()); S.cards.forEach((c) => drawCard(c)); requestAnimationFrame(drawLinks); }
const pan = () => { el.world.style.transform = `translate(${S.pan.x}px,${S.pan.y}px) scale(${S.pan.k})`; };
function freeSpot() {
  const r = el.canvas.getBoundingClientRect();
  let x = (r.width / 2 - S.pan.x) / S.pan.k - W / 2, y = (100 - S.pan.y) / S.pan.k;
  while (S.cards.some((o) => Math.abs(o.x - x) < W && Math.abs(o.y - y) < 140)) y += 170;
  return { x, y };
}
function spotNear(id) {
  const c = S.cards.find((x) => x.id === id);
  if (!c) return freeSpot();
  let x = c.x + W + GAP, y = c.y;
  while (S.cards.some((o) => Math.abs(o.x - x) < W && Math.abs(o.y - y) < 140)) y += 170;
  return { x, y };
}
function laneY(x0, x1, y) {
  for (let moved = true; moved;) {
    moved = false;
    for (const c of S.cards) { const B = box(c); if (B.r > x0 && B.l < x1 && B.b > y && B.t < y + LANE_H) { y = B.b + GAP; moved = true; } }
  }
  return y;
}
function removeCard(id) {
  S.cards = S.cards.filter((c) => c.id !== id);
  S.links = S.links.filter((l) => l.from !== id && l.to !== id);
  if (S.sel === id) S.sel = null;
  redraw(); save();
}
const mineBlock = (t) => ({ id: MINE + t, kind: "mine", t, x: "" });
function addNode(t, x, y) {
  const have = S.cards.find((c) => c.id === MINE + t);
  if (have) return have;
  if (x == null) ({ x, y } = freeSpot());
  return addCard(mineBlock(t), x, y);
}

// ---------- side panel ----------
const connectBox = (id) => `<form class="bconnect" data-from="${esc(id)}"><span>連到</span>
  <input name="to" placeholder="另一個節點，例如 屍羅四義" autocomplete="off"><button class="btn small">找路徑</button></form><div id="bpaths"></div>`;
function select(id) {
  S.sel = id;
  el.world.querySelectorAll(".bcard").forEach((n) => n.classList.toggle("on", n.dataset.id === id));
  if (id) id.startsWith(MINE) ? nodePanel(id.slice(MINE.length)) : blockPanel(+id.slice(1));
}
async function results(terms, fromId) {
  const gs = await search(terms);
  const bs = await blocks(gs); bs.forEach((b) => known.set(b.id, b));
  const rel = IX.related[terms[0]] || [];
  return (rel.length ? `<div class="bconcepts"><span class="muted">相關概念</span>${rel.map((c) =>
      `<button class="chip" data-concept="${esc(c.name)}" title="${c.kind === "same_as" ? "亦稱" : "相關"}">${c.kind === "same_as" ? "＝" : "★"} ${esc(c.name)}</button>`).join("")}</div>` : "") +
    `<div class="bg-hd">相關卡片 · ${bs.length}</div>` +
    (bs.length ? bs.map((b) => mini(b, `<button class="btn small" data-connect="${b.id}">＋ 接上</button>`)).join("")
      : `<p class="muted">筆記裡找不到「${esc(terms.join("、"))}」。</p>`) + `<div id="bbridge"></div>`;
}
async function nodePanel(t) {
  S.focus = termsFor(t);
  el.side.innerHTML = `<div class="bs-cur"><span class="mine-tag">我的節點</span> <b>${esc(t)}</b></div>${connectBox(MINE + t)}<p class="muted" id="bwait">找相關卡片…</p>`;
  const html = await results(S.focus, MINE + t);
  if (S.sel === MINE + t) $("bwait").outerHTML = html;
}
async function blockPanel(g) {
  el.side.innerHTML = `<p class="muted">展開中…</p>`;
  const r = await expand(g, S.focus);
  for (const gr of r.groups) (await blocks(gr.gs)).forEach((b) => known.set(b.id, b));
  const b = r.b;
  el.side.innerHTML = connectBox(b.id) +
    `<div class="bs-cur"><div class="bm-hd">${src(b)}</div><div class="bc-t">${inline(b.t, b)}</div>
      <div class="bs-full">${body(b)}</div><button class="btn small" data-src="${b.id}">法師原話（逐字稿）</button><div class="bs-tx" hidden></div></div>` +
    (r.concepts.length ? `<div class="bconcepts"><span class="muted">接到概念</span>${r.concepts.map((c) =>
      `<button class="chip${c.kind ? " on" : ""}" data-concept="${esc(c.name)}">${c.kind === "same_as" ? "＝ " : c.kind ? "★ " : ""}${esc(c.name)}</button>`).join("")}</div>` : "") +
    r.groups.map((gr) => `<div class="bg-hd">${gr.label}</div>` + gr.gs.map((x) => mini(known.get("b" + x),
      `<button class="btn small" data-connect="b${x}" data-label="${gr.label}">＋ 接上</button>`)).join("")).join("") +
    `<div id="bbridge"></div>`;
}
async function bridge(concept) {
  const a = S.focus[0] || "", box_ = $("bbridge");
  box_.innerHTML = `<p class="muted">找「${esc(a)}」與「${esc(concept)}」…</p>`;
  let gs = await search([a, concept], 8);
  if (!gs.length) gs = await search([concept], 8);
  const bs = await blocks(gs); bs.forEach((b) => known.set(b.id, b));
  box_.innerHTML = `<div class="bg-hd">${esc(a)} → ${esc(concept)}</div>` +
    bs.map((b) => mini(b, `<button class="btn small" data-connect="${b.id}" data-label="${esc(concept)}">＋ 接上</button>`)).join("");
  box_.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function transcriptLines(b) {
  const k = `${b.ch}/${b.s}/${b.no}`;
  if (!linesCache.has(k)) linesCache.set(k, getJSON(`data/${k}.json`).then((d) => d.lines || []));
  return linesCache.get(k);
}
async function showSource(id, boxEl) {
  const b = known.get(id);
  boxEl.hidden = false; boxEl.innerHTML = `<p class="muted">讀逐字稿…</p>`;
  const lines = await transcriptLines(b);
  boxEl.innerHTML = b.c.filter(([s, e]) => e - s <= 40).slice(0, 4).map(([s, e]) =>
    `<div class="btx"><a class="bcite" href="${txUrl(b, s)}" target="_blank" rel="noopener">〔行${s}${e > s ? "–" + e : ""}〕</a>` +
    lines.slice(s - 1, e).map(esc).join("<br>") + `</div>`).join("") || `<p class="muted">此卡沒有可列出的逐字稿行。</p>`;
}
async function findPaths(fromId, to) {
  const out = $("bpaths");
  out.innerHTML = `<p class="muted">找「${esc(to)}」的路徑…</p>`;
  const a = fromId.startsWith(MINE) ? fromId.slice(MINE.length)
    : (S.focus.find((f) => known.get(fromId).x.includes(f)) || (termsOfBlocks().get(+fromId.slice(1)) || [])[0] || known.get(fromId).t);
  const r = await paths(a, to.trim());
  if (r.missing.length) { out.innerHTML = `<p class="muted">筆記裡找不到「${esc(r.missing.join("、"))}」。</p>`; return; }
  if (!r.paths.length) { out.innerHTML = `<p class="muted">找不到「${esc(a)}」到「${esc(to)}」的路徑。</p>`; return; }
  for (const p of r.paths) { p.blocks = await blocks(p.gs); p.blocks.forEach((b) => known.set(b.id, b)); }
  lastPaths = { fromId, ...r };
  out.innerHTML = `<div class="bg-hd">「${esc(r.a)}」→「${esc(r.b)}」 · ${r.paths.length} 條路徑 <button class="btn small" data-pathall="1">全部放上</button></div>` +
    r.paths.map((p, i) => `<div class="bpath"><div class="bp-chain">${p.vias.map(esc).join(" → ")}</div>` +
      p.blocks.map((b) => `<div class="bp-step">${src(b)}<div class="bm-t">${inline(b.t || b.st, b)}</div><div class="bm-x">${body(b)}</div></div>`).join("") +
      `<button class="btn small" data-path="${i}">放上白板</button></div>`).join("");
}
function placePath(i) {
  const { fromId, b: to, paths: all } = lastPaths, p = all[i];
  const A = S.cards.find((c) => c.id === fromId);
  if (!A) return;
  const step = W + GAP, longest = Math.max(...all.map((q) => q.gs.length));
  let B = S.cards.find((c) => c.id === MINE + to) || addNode(to, A.x + (longest + 1) * step, A.y);
  const y = laneY(Math.min(A.x, B.x) + W + 40, Math.max(A.x, B.x) - 40, A.y);
  let prev = A.id;
  p.blocks.forEach((b, k) => {
    addCard(b, A.x + (k + 1) * (B.x - A.x) / (p.blocks.length + 1), y);
    link(prev, b.id, k === 0 ? "" : p.vias[k]); prev = b.id;
  });
  link(prev, B.id);
  requestAnimationFrame(drawLinks);
  const btn = el.side.querySelector(`[data-path="${i}"]`);
  if (btn) { btn.textContent = "✓ 已放上"; btn.disabled = true; }
}

// ---------- start, saving, export ----------
async function start() {
  const q = el.q.value.trim();
  if (!q) return;
  S.focus = termsFor(q);
  const node = addNode(S.focus.join("・"));
  select(node.id);
}
function savedBoards() { try { return JSON.parse(localStorage.getItem(SAVED) || "{}"); } catch (e) { return {}; } }
function refreshSaved() {
  const all = savedBoards();
  el.load.innerHTML = `<option value="">— 開啟 —</option>` + Object.keys(all).map((n) => `<option>${esc(n)}</option>`).join("");
}
function saveAs() {
  const all = savedBoards();
  let name = el.name.value.trim() || (S.cards.find((c) => c.block.kind === "mine") || {}).block?.t || "白板";
  if (all[name] && name !== el.current) {
    let n = 2; while (all[`${name} ${n}`]) n++; name = `${name} ${n}`;
  }
  all[name] = { cards: S.cards, links: S.links, saved: new Date().toISOString().slice(0, 16) };
  try { localStorage.setItem(SAVED, JSON.stringify(all)); el.status.textContent = `已存「${name}」（僅存在此瀏覽器）`; }
  catch (e) { el.status.textContent = "✕ 瀏覽器不允許存檔，請改用「下載」"; }
  el.name.value = name; el.current = name; refreshSaved();
}
function open(data, name) {
  S.cards = data.cards || []; S.links = data.links || [];
  S.cards.forEach((c) => known.set(c.id, c.block));
  el.current = name || ""; el.name.value = name || "";
  redraw(); save();
}
function download(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function readingOrder() {
  const has = new Set(S.links.map((l) => l.to)), seen = new Set(), out = [];
  const walk = (id, depth, via) => {
    if (seen.has(id)) return; seen.add(id);
    const c = S.cards.find((x) => x.id === id); if (!c) return;
    out.push([c, depth, via]);
    const ls = S.links.filter((l) => l.from === id);
    ls.filter((l) => !/^\d*$/.test(l.label)).forEach((l) => walk(l.to, depth + 1, l.label));
    ls.filter((l) => /^\d*$/.test(l.label)).forEach((l) => walk(l.to, depth, ""));
  };
  S.cards.filter((c) => !has.has(c.id)).sort((a, b) => a.y - b.y || a.x - b.x).forEach((c) => walk(c.id, 0, ""));
  S.cards.forEach((c) => walk(c.id, 0, ""));
  return out;
}
async function exportMd() {
  const name = el.name.value.trim() || "白板";
  const out = [`# ${name}`, "", "> 卡片內文取自學習筆記；「法師原話」取自逐字稿；**我的節點** 是自己寫的理解。", ""];
  let n = 0;
  for (const [c, depth, via] of readingOrder()) {
    const b = c.block;
    const head = depth ? `### 支線・${via || "延伸"}：` : `## ${++n}. `;
    if (b.kind === "mine") { out.push(`${head}我的節點：${b.t}`, "", b.x || "（尚未填寫）", ""); continue; }
    out.push(`${head}${b.t.replace(/\*\*/g, "")}`, "", `*體佛法師《${b.s}》第${b.no}講 §${b.sec} ${b.st}* — ${location.origin}${noteUrl(b)}`, "");
    let text = b.x;
    if (b.k === "table_row" && text.includes("\n")) { const [h, r] = text.split("\n"); text = `${h}\n|${"---|".repeat(cells(h).length)}\n${r}`; }
    out.push(text, "");
    const lines = await transcriptLines(b);
    for (const [s, e] of b.c.filter(([s, e]) => e - s <= 40).slice(0, 4)) {
      out.push(`**法師原話**（逐字稿〔行${s}${e > s ? "–" + e : ""}〕）`, "", ...lines.slice(s - 1, e).map((t) => "> " + t), "");
    }
  }
  download(out.join("\n"), name + ".md", "text/markdown");
}

// ---------- interaction ----------
function wire() {
  ["q", "side", "canvas", "world", "svg", "labels", "name", "load", "status"].forEach((k) => { el[k] = $("board-" + k); });
  $("board-go").onclick = start;
  el.q.addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });
  $("board-save").onclick = saveAs;
  $("board-clear").onclick = () => { S.cards = []; S.links = []; el.current = ""; el.name.value = ""; redraw(); save(); el.side.innerHTML = $("board-help").innerHTML; };
  $("board-dl").onclick = () => download(JSON.stringify({ schema: "board/v1", name: el.name.value, cards: S.cards, links: S.links }, null, 1),
    (el.name.value || "白板") + ".json", "application/json");
  $("board-up").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); open(d, d.name || f.name.replace(/\.json$/, "")); }
    catch (err) { el.status.textContent = "✕ 不是白板檔"; }
    e.target.value = "";
  };
  $("board-md").onclick = exportMd;
  el.load.onchange = () => { const all = savedBoards(); if (all[el.load.value]) open(all[el.load.value], el.load.value); };

  el.side.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.closest(".bconnect"), to = f && f.elements.to.value.trim();
    if (to) findPaths(f.dataset.from, to);
  });
  el.side.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.connect) {
      const b = known.get(t.dataset.connect), p = spotNear(S.sel);
      addCard(b, p.x, p.y); link(S.sel, b.id, t.dataset.label || "");
      requestAnimationFrame(drawLinks); t.textContent = "✓ 已接"; t.disabled = true;
    } else if (t.dataset.path) placePath(+t.dataset.path);
    else if (t.dataset.pathall) lastPaths.paths.forEach((_, i) => placePath(i));
    else if (t.dataset.src) showSource(t.dataset.src, el.side.querySelector(".bs-tx"));
    else if (t.dataset.concept) bridge(t.dataset.concept);
  });
  el.side.addEventListener("dragstart", (e) => { const m = e.target.closest(".bmini"); if (m) e.dataTransfer.setData("text/board-id", m.dataset.id); });
  el.canvas.addEventListener("dragover", (e) => e.preventDefault());
  el.canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/board-id"), b = known.get(id); if (!b) return;
    const r = el.canvas.getBoundingClientRect();
    addCard(b, (e.clientX - r.left - S.pan.x) / S.pan.k - W / 2, (e.clientY - r.top - S.pan.y) / S.pan.k - 20);
    if (S.sel && S.sel !== id) link(S.sel, id);
    requestAnimationFrame(drawLinks);
  });

  // a card moves by its header or footer; its body text selects, kept inside that card
  let drag = null;
  document.addEventListener("selectionchange", () => {
    if (!drag || drag.kind !== "text") return;
    const sel = getSelection(), bodyEl = drag.card.querySelector(".bc-body");
    if (!sel.rangeCount || !sel.focusNode || bodyEl.contains(sel.focusNode)) return;
    const after = sel.anchorNode && (sel.anchorNode.compareDocumentPosition(sel.focusNode) & Node.DOCUMENT_POSITION_FOLLOWING);
    sel.extend(bodyEl, after ? bodyEl.childNodes.length : 0);
  });
  el.canvas.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".bcard");
    if (e.target.closest(".bc-x")) { removeCard(card.dataset.id); return; }
    if (e.target.closest(".bc-src")) { select(card.dataset.id); setTimeout(() => { const bx = el.side.querySelector(".bs-tx"); if (bx) showSource(card.dataset.id, bx); }, 500); return; }
    if (e.target.closest("a")) return;
    if (card && e.target.closest(".bc-body")) { drag = { kind: "text", id: card.dataset.id, card }; card.classList.add("selecting"); el.canvas.classList.add("text-select"); return; }
    e.preventDefault();
    getSelection().removeAllRanges();
    if (card) {
      const c = S.cards.find((x) => x.id === card.dataset.id);
      card.style.zIndex = ++zTop;
      drag = { kind: "card", c, card, sx: e.clientX, sy: e.clientY, ox: c.x, oy: c.y, moved: false };
    } else drag = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: S.pan.x, oy: S.pan.y };
    el.canvas.classList.add("dragging");
    el.canvas.setPointerCapture(e.pointerId);
  });
  el.canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.kind === "text") return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.kind === "card") {
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      drag.c.x = drag.ox + dx / S.pan.k; drag.c.y = drag.oy + dy / S.pan.k;
      Object.assign(drag.card.style, { left: drag.c.x + "px", top: drag.c.y + "px" });
      drawLinks();
    } else { S.pan.x = drag.ox + dx; S.pan.y = drag.oy + dy; pan(); }
  });
  el.canvas.addEventListener("pointerup", () => {
    if (drag?.kind === "card") { if (!drag.moved) select(drag.c.id); else save(); }
    if (drag?.kind === "text") { drag.card.classList.remove("selecting"); if (getSelection().isCollapsed && S.sel !== drag.id) select(drag.id); }
    el.canvas.classList.remove("dragging", "text-select");
    drag = null;
  });
  el.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = el.canvas.getBoundingClientRect(), k = Math.min(1.6, Math.max(0.3, S.pan.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    S.pan.x = mx - (mx - S.pan.x) * k / S.pan.k; S.pan.y = my - (my - S.pan.y) * k / S.pan.k; S.pan.k = k; pan();
  }, { passive: false });
  pan();
}

wire();
el.side.innerHTML = `<p class="muted">載入索引…</p>`;
IX = await getJSON("data/board/index.json");
N = IX.blocks;
refreshSaved();
el.side.innerHTML = $("board-help").innerHTML;
try { const cur = JSON.parse(localStorage.getItem(STORE) || "null"); if (cur && cur.cards.length) open(cur); } catch (e) {}
const q0 = new URLSearchParams(location.search).get("q");
if (q0) { el.q.value = q0; start(); }
