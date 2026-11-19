// Search page: exact-phrase search over the Pagefind index.
//
// Pagefind splits Chinese into words, and does so differently from page to page, so a plain query misses many
// pages (五蘊 finds 35 of 359+) while a query split into single characters finds them all but also matches
// pages that have the characters apart (投胎 matching 五體投地…胎). We take candidates from both, then keep a page
// only if its text holds every query term as typed (whitespace ignored). Pages are checked lazily, a batch at
// a time, because each check downloads that page's text.
//
// Result links carry #hl=… so the page (scripts/hl.js) scrolls to that match and marks it.

const PAGE = 10;          // verified results to show per "more"
const BATCH = 8;          // candidate pages fetched at once
const SNIPS = 3;          // excerpts per page
const CTX = 40;           // characters of context on each side of an excerpt

const $ = (id) => document.getElementById(id);
const input = $("sx-q"), statusEl = $("sx-status"), list = $("sx-results"), more = $("sx-more"), filtersEl = $("sx-filters");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const terms = (q) => q.trim().split(/\s+/).filter(Boolean);
const spaced = (q) => q.replace(/([㐀-鿿豈-﫿])(?=[㐀-鿿豈-﫿])/g, "$1 ");

let pf;
try {
  pf = await import(document.querySelector("script[data-pagefind]").dataset.pagefind);
  await pf.init();
} catch {
  // the index is made by `npm run build`; `npm run dev` has none until `npm run index:dev`
  statusEl.innerHTML = '<span class="raw-note" style="display:block">搜尋索引尚未產生。本機開發請先執行 <code>npm run build && npm run index:dev</code>，或用 <code>npm run preview</code> 預覽建置結果。</span>';
  input.disabled = true;
  throw new Error("pagefind index missing");
}

// ---------------------------------------------------------------- filters

const active = {};   // filter name -> value ("" = all)
const ORDER = ["類型", "講者", "系列"];
{
  const all = await pf.filters();
  const names = Object.keys(all).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const params = new URLSearchParams(location.search);
  for (const name of names) {
    const values = Object.keys(all[name]).sort((a, b) => a.localeCompare(b, "zh-Hant"));
    if (values.length < 2) continue;
    active[name] = values.includes(params.get(name)) ? params.get(name) : "";
    const label = document.createElement("label");
    label.innerHTML = `<span>${esc(name)}</span>`;
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">全部</option>` + values.map((v) => `<option>${esc(v)}</option>`).join("");
    sel.value = active[name];
    sel.addEventListener("change", () => { active[name] = sel.value; run(); });
    label.append(sel);
    filtersEl.append(label);
  }
  filtersEl.hidden = !filtersEl.children.length;
}

// ---------------------------------------------------------------- matching

// whitespace-free, lower-cased copy of the text plus a map back to the original offsets
function normalize(text) {
  let norm = "", map = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    norm += c.toLowerCase(); map.push(i);
  }
  return { norm, map };
}

// every occurrence of every term, as [start, end) in the original text, in page order; null if a term is missing
function find(text, ts) {
  const { norm, map } = normalize(text);
  const hits = [];
  for (const t of ts) {
    const nt = normalize(t).norm;
    let i = norm.indexOf(nt), n = 0;
    for (; i >= 0; i = norm.indexOf(nt, i + nt.length), n++) hits.push([map[i], map[i + nt.length - 1] + 1]);
    if (!n) return null;
  }
  return hits.sort((a, b) => a[0] - b[0]);
}

// Where a result opens: hl.js on the page finds `hl` in the page's indexed text and scrolls to it. `hl` alone
// means its first occurrence; to reach a later one, add the text just before it (then just after it) as `pre`
// and `suf` until no earlier spot on the page reads the same. Compared without whitespace, as find() does.
function link(url, N, [s, e]) {
  const { norm, map } = N;
  const a = map.indexOf(s), b = map.indexOf(e - 1) + 1;
  const unique = (p, q) => norm.indexOf(norm.slice(a - p, b + q)) === a - p;
  let p = 0, q = 0;
  while (!unique(p, q) && p < 20 && a - p > 0) p++;
  while (!unique(p, q) && q < 20 && b + q < norm.length) q++;
  const h = new URLSearchParams({ hl: norm.slice(a, b) });
  if (p) h.set("pre", norm.slice(a - p, a));
  if (q) h.set("suf", norm.slice(b, b + q));
  return `${url}#${h}`;
}

function excerpt(text, hits, center) {
  const from = Math.max(0, center[0] - CTX), to = Math.min(text.length, center[1] + CTX);
  let out = "", at = from;
  for (const [s, e] of hits) {
    if (e <= from || s >= to || s < at) continue;
    out += esc(text.slice(at, s)) + "<mark>" + esc(text.slice(s, Math.min(e, to))) + "</mark>";
    at = Math.min(e, to);
  }
  out += esc(text.slice(at, to));
  return (from > 0 ? "…" : "") + out.trim() + (to < text.length ? "…" : "");
}

// spread the excerpts over the page: first hit, then ones far enough apart not to repeat each other
function pickSnips(hits) {
  const out = [];
  for (const h of hits) {
    if (out.length >= SNIPS) break;
    if (!out.length || h[0] - out[out.length - 1][1] > CTX * 2) out.push(h);
  }
  return out;
}

function render(d, hits) {
  const text = d.content, url = d.url.replace(/#.*$/, ""), N = normalize(text);
  const type = d.filters?.["類型"]?.[0];
  const li = document.createElement("li");
  li.innerHTML =
    `<a class="sx-title" href="${esc(link(url, N, hits[0]))}">${esc(d.meta.title || url)}</a>` +
    `<span class="muted">${type ? "・" + esc(type) : ""}・${hits.length} 處</span>` +
    pickSnips(hits).map((h) => `<a class="sx-snip" href="${esc(link(url, N, h))}">${excerpt(text, hits, h)}</a>`).join("");
  return li;
}

// ---------------------------------------------------------------- search

let run_id = 0, queue = [], shown = 0, checked = 0, total = 0, ts = [];

async function search(q) {
  const filters = Object.fromEntries(Object.entries(active).filter(([, v]) => v));
  const opts = Object.keys(filters).length ? { filters } : {};
  // the query as typed first: its pages almost always hold the phrase, so true hits come early;
  // then the character-split query, which catches the pages Pagefind segmented differently
  const runs = [await pf.search(q, opts)];
  const sp = spaced(q);
  if (sp !== q) runs.push(await pf.search(sp, opts));
  const seen = new Set(), out = [];
  for (const r of runs) for (const x of r?.results ?? []) if (!seen.has(x.id)) { seen.add(x.id); out.push(x); }
  return out;
}

async function fill(id) {
  more.hidden = true;
  let added = 0;
  while (added < PAGE && queue.length) {
    const batch = queue.splice(0, BATCH);
    const data = await Promise.all(batch.map((x) => x.data()));
    if (id !== run_id) return;
    checked += batch.length;
    for (const d of data) {
      const hits = find(d.content, ts);
      if (hits) { list.append(render(d, hits)); shown++; added++; }
    }
    status(id);
  }
  more.hidden = !queue.length;
  status(id);
}

function status(id) {
  if (id !== run_id) return;
  const q = esc(ts.join(" "));
  if (!queue.length) statusEl.textContent = shown ? `找到 ${shown} 頁含有「${ts.join(" ")}」` : `找不到「${ts.join(" ")}」`;
  else statusEl.innerHTML = `已找到 ${shown} 頁含有「${q}」（已檢查 ${checked}／${total} 個候選頁）`;
}

async function run() {
  const id = ++run_id, q = input.value.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  for (const [k, v] of Object.entries(active)) if (v) params.set(k, v);
  history.replaceState(null, "", location.pathname + (params.size ? "?" + params : ""));
  list.innerHTML = ""; more.hidden = true; queue = []; shown = checked = total = 0; ts = terms(q);
  if (!q) { statusEl.textContent = ""; return; }
  statusEl.textContent = "搜尋中…";
  const found = await search(q);
  if (id !== run_id) return;
  queue = found; total = found.length;
  await fill(id);
}

let timer;
input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 300); });
input.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); run(); } });
more.addEventListener("click", () => fill(run_id));

const q0 = new URLSearchParams(location.search).get("q");
if (q0) { input.value = q0; run(); } else input.focus();
