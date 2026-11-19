// #hl=詞[&pre=…][&suf=…], from the search page and the 名相 pages: mark that word and bring it into view.
// Only the indexed text counts (the [data-pagefind-body] that search matched against), so the copy of the
// transcript inside the note page's player is never the one found. `pre`/`suf` pick a later occurrence:
// the first place reading pre+hl+suf; without them, or if the page changed since, the first `hl`.
// Comparison ignores whitespace and case, as the search page's does.
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const strip = (s) => (s ?? "").replace(/\s+/g, "").toLowerCase();
  const term = strip(h.get("hl")), pre = strip(h.get("pre")), suf = strip(h.get("suf"));
  const root = document.querySelector("[data-pagefind-body]");
  if (!term || !root) return;

  // the root's visible text, without whitespace, and where each character sits
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement.closest("[data-pagefind-ignore], [hidden], script, style")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let norm = "";
  const at = [];
  for (let n; (n = walker.nextNode());)
    for (let i = 0; i < n.data.length; i++)
      if (!/\s/.test(n.data[i])) { norm += n.data[i].toLowerCase(); at.push([n, i]); }

  let i = pre || suf ? norm.indexOf(pre + term + suf) : -1;
  i = i >= 0 ? i + pre.length : norm.indexOf(term);
  if (i < 0) return;

  // wrap the match in <mark>, one per text node it spans (it may cross inline markup)
  const parts = [];
  for (let k = i; k < i + term.length; k++) {
    const [n, o] = at[k], last = parts[parts.length - 1];
    if (last?.n === n) last.e = o + 1; else parts.push({ n, s: o, e: o + 1 });
  }
  const marks = parts.reverse().map(({ n, s, e }) => {
    const r = document.createRange();
    r.setStart(n, s); r.setEnd(n, e);
    const m = document.createElement("mark");
    m.className = "hit";
    r.surroundContents(m);
    return m;
  }).reverse();
  marks[0].closest(".prose p, .prose li, .prose td, .prose blockquote, .ts p")?.classList.add("flash");

  // a third of the way down the space the docked player leaves free
  const go = () => {
    const pl = document.getElementById("player");
    const ph = pl && getComputedStyle(pl).position === "sticky" ? pl.offsetHeight : 0;
    const top = marks[0].getBoundingClientRect().top + scrollY - ph - (innerHeight - ph) / 3;
    scrollTo({ top: Math.max(0, top), behavior: "instant" });
  };
  go();
  // fonts, the video frame and the note's transcript arriving can shift the layout: settle once more,
  // unless the reader has started scrolling by then
  let moved = false;
  const stop = () => { moved = true; };
  for (const ev of ["wheel", "touchmove", "keydown"]) addEventListener(ev, stop, { once: true, passive: true });
  const again = () => setTimeout(() => { if (!moved) go(); }, 300);
  if (document.readyState === "complete") again(); else addEventListener("load", again, { once: true });
})();
