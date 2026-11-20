// Bringing a found place into view, for every way in: search results, 名相 pages, the sutra pages, #L links.
//
// window.notesReveal(el, scroller?): put el a third of the way down the space the text has free (below the
// docked player on a narrow screen; the whole window on a wide one, where the player sits beside the text),
// and keep it there while the layout settles: fonts, the video frame, the note sections and transcript rows
// that are laid out only near the view (content-visibility) all move it after the first jump. Stops as soon
// as the reader scrolls. `scroller` is a scrolling box (the side panel's transcript) instead of the window.
//
// The address can ask for a place:
//   #L123                     a transcript paragraph (the nearest one before a blank line)
//   #hl=詞[&pre=…][&suf=…]    mark that word in the page's indexed text ([data-pagefind-body], so the copy of
//                             the transcript inside the note page's player is never the one found). `pre`/`suf`
//                             pick a later occurrence: the first place reading pre+hl+suf; without them, or
//                             if the page changed since, the first `hl`.
//   #hl=a&hl=b&s=T0670        alternatives, tried in order; a passage not found whole is tried by its two
//                             longest clauses (the note may punctuate a quote differently). With none found,
//                             the note's first link to that sutra (《…》), else the id as text.
// Comparison ignores whitespace and case, as the search page's does.
(() => {
  const SETTLE_MS = 3000;
  const strip = (s) => (s ?? "").replace(/\s+/g, "").toLowerCase();
  const cover = () => {
    const pl = document.getElementById("player");
    if (!pl || getComputedStyle(pl).position !== "sticky") return 0;
    return window.notesCover ? notesCover(pl) : pl.offsetHeight;
  };

  window.notesReveal = (el, sc) => {
    const win = !sc || sc === window;
    const place = () => {
      if (win) {
        const ph = cover();
        const top = el.getBoundingClientRect().top + scrollY - ph - (innerHeight - ph) / 3;
        scrollTo({ top: Math.max(0, top), behavior: "instant" });
      } else {
        const d = el.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 3;
        sc.scrollTo({ top: Math.max(0, sc.scrollTop + d), behavior: "instant" });
      }
    };
    place();
    let done = false;
    const ro = new ResizeObserver(() => { if (!done) place(); });
    const stop = () => { if (done) return; done = true; ro.disconnect(); };
    // what can still change size above it: the text it sits in, and the player over it
    ro.observe(el.closest("[data-pagefind-body], [data-ts-view]") ?? document.body);
    const pl = document.getElementById("player");
    if (pl) ro.observe(pl);
    const target = win ? window : sc;
    for (const ev of ["wheel", "touchmove", "keydown", "pointerdown"]) target.addEventListener(ev, stop, { once: true, passive: true });
    if (document.readyState !== "complete") addEventListener("load", () => { if (!done) place(); }, { once: true });
    setTimeout(stop, SETTLE_MS);
  };

  // restart the paragraph's flash, held longer than the one the video's "↓ 對應段落" gives
  const flash = (el) => {
    if (!el) return;
    el.classList.remove("flash"); void el.offsetWidth;
    el.classList.add("flash", "found");
  };

  // ---------- #L123
  const line = location.hash.match(/^#L(\d+)$/);
  if (line) {
    const el = window.notesLine ? notesLine(Number(line[1])) : document.getElementById("L" + line[1]);
    if (!el) return;
    el.classList.add("hl");
    flash(el);
    notesReveal(el);
    return;
  }

  // ---------- #hl=…
  const h = new URLSearchParams(location.hash.slice(1));
  const terms = h.getAll("hl").map(strip).filter(Boolean);
  const pre = strip(h.get("pre")), suf = strip(h.get("suf")), sutra = (h.get("s") ?? "").trim();
  const root = document.querySelector("[data-pagefind-body]");
  if (!(terms.length || sutra) || !root) return;
  const ignored = (el) => el.closest("[data-pagefind-ignore], [hidden], script, style");

  // the root's visible text, without whitespace, and where each character sits
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (ignored(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let norm = "";
  const at = [];
  for (let n; (n = walker.nextNode());)
    for (let i = 0; i < n.data.length; i++)
      if (!/\s/.test(n.data[i])) { norm += n.data[i].toLowerCase(); at.push([n, i]); }

  const clauses = (t) => t.split(/[，。、；：！？「」『』（）〈〉《》“”‘’,.;:!?()[\]…—]+/)
    .filter((c) => c.length >= 4 && c !== t).sort((a, b) => b.length - a.length).slice(0, 2);
  let i = -1, term = "";
  for (const [k, t] of [...terms.entries(), ...terms.flatMap((t) => clauses(t)).map((c) => [-1, c])]) {
    if (k === 0 && (pre || suf)) {
      const j = norm.indexOf(pre + t + suf);
      if (j >= 0) { i = j + pre.length; term = t; break; }
    }
    i = norm.indexOf(t);
    if (i >= 0) { term = t; break; }
  }

  let first;
  if (i < 0 && sutra) {
    // where the note names the sutra: its 《…》 link to the sutra page, as render.ts makes them
    const a = [...root.querySelectorAll('a.ent[href*="/sutra/"]')]
      .find((a) => !ignored(a) && a.pathname.replace(/\/$/, "").endsWith("/sutra/" + sutra));
    if (a) {
      first = document.createElement("mark");
      first.className = "hit";
      first.append(...a.childNodes);
      a.append(first);
    } else if ((i = norm.indexOf(strip(sutra))) >= 0) term = strip(sutra);
  }
  if (!first) {
    if (i < 0) return;
    // wrap the match in <mark>, one per text node it spans (it may cross inline markup)
    const parts = [];
    for (let k = i; k < i + term.length; k++) {
      const [n, o] = at[k], last = parts[parts.length - 1];
      if (last?.n === n) last.e = o + 1; else parts.push({ n, s: o, e: o + 1 });
    }
    first = parts.reverse().map(({ n, s, e }) => {
      const r = document.createRange();
      r.setStart(n, s); r.setEnd(n, e);
      const m = document.createElement("mark");
      m.className = "hit";
      r.surroundContents(m);
      return m;
    }).at(-1);
  }
  flash(first.closest(".prose p, .prose li, .prose td, .prose blockquote, .prose h2, .prose h3, .ts p"));
  notesReveal(first);
})();
