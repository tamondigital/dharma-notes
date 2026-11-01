// 筆記 reader: citation popovers, the docked YouTube player with a follow-along transcript, TOC highlight.
(() => {
  const art = document.querySelector("article[data-transcript]");
  if (!art) return;
  const videoId = art.dataset.video;

  // ---------- transcript data (lazy) ----------
  let dataP = null;
  const loadData = () => (dataP ??= fetch(art.dataset.transcript).then((r) => r.json()).catch(() => null));

  const fmt = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  };
  // time of line n: its own, else the nearest timed line at or before it, else after
  function timeOf(data, n) {
    if (data.t[n]) return data.t[n];
    for (let k = n - 1; k > n - 12 && k > 0; k--) if (data.t[k]) return [data.t[k][0], 1];
    for (let k = n + 1; k < n + 12; k++) if (data.t[k]) return [data.t[k][0], 1];
    return null;
  }
  function excerpt(data, s, e) {
    const out = [];
    for (let n = s; n <= Math.min(e, s + 6); n++) {
      const t = (data.lines[n - 1] || "").trim();
      if (t) out.push(t.replace(/\*\*/g, ""));
    }
    return out.join(" ");
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- popover ----------
  let pop = null, popFor = null, hoverTimer = null;
  function closePop() {
    pop?.remove(); pop = null;
    popFor?.classList.remove("on"); popFor = null;
  }
  function place(el) {
    const r = popFor.getBoundingClientRect();
    const w = el.offsetWidth, vw = document.documentElement.clientWidth;
    let left = r.left + window.scrollX - w / 2 + r.width / 2;
    left = Math.max(window.scrollX + 16, Math.min(left, window.scrollX + vw - w - 16));
    let top = r.bottom + window.scrollY + 6;
    if (r.bottom + el.offsetHeight + 12 > window.innerHeight && r.top > el.offsetHeight + 12)
      top = r.top + window.scrollY - el.offsetHeight - 6;
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  async function openPop(a) {
    if (popFor === a) return;
    closePop();
    popFor = a; a.classList.add("on");
    pop = document.createElement("div");
    pop.className = "pop"; pop.setAttribute("role", "dialog");
    pop.innerHTML = '<div class="pop-head">載入中…</div>';
    document.body.appendChild(pop); place(pop);
    const mine = pop;
    const data = await loadData();
    if (pop !== mine) return;
    const ranges = a.dataset.r.split(",").map((x) => x.split("-").map(Number));
    let html = a.dataset.note ? `<div class="pop-note">${esc(a.dataset.note)}</div>` : "";
    for (const [s, e0] of ranges) {
      const e = e0 || s;
      const t = data && timeOf(data, s);
      const label = `行${s}${e !== s ? "–" + e : ""}`;
      const time = t ? `${t[1] ? "≈" : ""}${fmt(t[0])}` : "";
      html += `<div class="pop-row"><div class="pop-head"><span>${label}${time ? " · " + time : ""}</span>` +
        (t && videoId ? `<button class="play" data-seek="${t[0]}">▶ 播放</button>` : "") + `</div>` +
        (data ? `<p class="pop-text">${esc(excerpt(data, s, e))}</p>` : "") + `</div>`;
    }
    html += `<div class="pop-foot"><a href="transcript/#L${ranges[0][0]}">在逐字稿中看 →</a></div>`;
    pop.innerHTML = html;
    place(pop);
  }

  const body = art.querySelector(".prose");
  body.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.c");
    if (!a) return;
    ev.preventDefault();
    popFor === a ? closePop() : openPop(a);
  });
  if (matchMedia("(hover: hover)").matches) {
    body.addEventListener("mouseover", (ev) => {
      const a = ev.target.closest("a.c");
      if (!a) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => openPop(a), 250);
    });
    body.addEventListener("mouseout", (ev) => {
      if (ev.target.closest("a.c")) clearTimeout(hoverTimer);
    });
  }
  document.addEventListener("click", (ev) => {
    if (!pop) return;
    const seek = ev.target.closest("[data-seek]");
    if (seek) { play(Number(seek.dataset.seek)); closePop(); return; }
    if (!ev.target.closest(".pop, a.c")) closePop();
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePop(); });
  window.addEventListener("resize", () => pop && place(pop));

  // ---------- player (open by default) + follow-along transcript ----------
  const box = document.getElementById("player");
  const player = box && videoId ? window.notesPlayer(box, videoId) : null;
  const play = (sec) => player?.play(sec);
  if (player) {
    player.ensure();

    // two separate switches: show the transcript panel; let it follow the video
    const follow = box.querySelector("[data-follow]");
    const toggle = (btn, cls, key) => {
      const set = (on) => {
        box.classList.toggle(cls, !on);
        btn.setAttribute("aria-pressed", String(on));
        try { localStorage.setItem(key, on ? "1" : "0"); } catch (e) {}
      };
      try { if (localStorage.getItem(key) === "0") set(false); } catch (e) {}
      btn.addEventListener("click", () => set(box.classList.contains(cls)));
      return set;
    };
    toggle(box.querySelector("[data-toggle-panel]"), "no-ts", "ts-panel");
    const followBtn = box.querySelector("[data-toggle-follow]");
    toggle(followBtn, "no-follow", "ts-follow");
    let tracker = null;
    followBtn.addEventListener("click", () => tracker?.resume());

    // panel height: drag the grip under it, or arrow keys on the grip
    const grip = box.querySelector("[data-grip]");
    const lineH = () => parseFloat(getComputedStyle(follow).lineHeight) || 28;
    const setH = (px, keep) => {
      const h = Math.round(Math.min(Math.max(px, lineH() * 1.5), innerHeight * 0.6));
      box.style.setProperty("--follow-h", h + "px");
      if (keep) try { localStorage.setItem("ts-h", String(h)); } catch (e) {}
    };
    try { const h = Number(localStorage.getItem("ts-h")); if (h) setH(h); } catch (e) {}
    grip.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      grip.setPointerCapture(ev.pointerId);
      const y0 = ev.clientY, h0 = follow.offsetHeight;
      const move = (e) => setH(h0 + e.clientY - y0);
      const up = () => {
        setH(follow.offsetHeight, true);
        grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up);
      };
      grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up);
    });
    grip.addEventListener("keydown", (ev) => {
      const d = { ArrowDown: 1, ArrowUp: -1 }[ev.key];
      if (!d) return;
      ev.preventDefault();
      setH(follow.offsetHeight + d * lineH(), true);
    });

    // paragraphs after the title block; each keeps its own time or inherits the last one
    let rows = null;
    loadData().then((data) => {
      if (!data) { follow.innerHTML = '<p class="muted">逐字稿載入失敗。</p>'; return; }
      const title = data.lines.findIndex((x) => x.startsWith("# "));
      const start = data.lines.findIndex((x, i) => i > title && x.trim() === "---") + 1;
      let last = null, html = "";
      rows = [];
      data.lines.forEach((raw, i) => {
        const text = raw.trim().replace(/^> /, "").replace(/\*\*/g, "");
        if (i < start || !text) return;
        const own = data.t[i + 1];
        if (own) last = own[0];
        if (last == null) return;
        rows.push({ t: last, len: text.length });
        html += `<p data-i="${rows.length - 1}"><span class="tm">${own ? fmt(own[0]) : ""}</span>${esc(text)}</p>`;
      });
      follow.innerHTML = html || '<p class="muted">這一講沒有時間對照的逐字稿。</p>';
      if (!rows.length) return;
      rows.forEach((r, i) => { r.el = follow.children[i]; });
      tracker = notesFollow(player, rows, {
        scroller: follow, cls: "on",
        enabled: () => !box.classList.contains("no-follow") && !box.classList.contains("no-ts"),
      });
    });
    follow.addEventListener("click", (ev) => {
      const p = ev.target.closest("p[data-i]");
      if (p) play(rows[p.dataset.i].t);
    });

    // video -> note: the citations covering the line being spoken (else the latest one before it);
    // tapping again moves on to the next such place
    const toNote = box.querySelector("[data-to-note]");
    const toNoteN = box.querySelector("[data-to-note-n]");
    let cycle = { blocks: [], i: -1 }, nTimer = null;
    toNote?.addEventListener("click", async () => {
      const [data, yt] = await Promise.all([loadData(), player.ensure()]);
      if (!data) return;
      const now = player.started() ? yt.getCurrentTime?.() ?? 0 : player.resumeAt;
      let line = 0;
      for (const [n, v] of Object.entries(data.t)) if (v[0] <= now && Number(n) > line) line = Number(n);
      const covering = [], byTime = new Map();
      let bestT = -1, firstT = Infinity;
      for (const a of body.querySelectorAll("a.c")) {
        const ranges = a.dataset.r.split(",").map((x) => x.split("-").map(Number));
        if (line && ranges.some(([s, e]) => s <= line && line <= (e || s))) covering.push(a);
        const t = timeOf(data, ranges[0][0])?.[0];
        if (t == null) continue;
        if (!byTime.has(t)) byTime.set(t, []);
        byTime.get(t).push(a);
        if (t <= now && t > bestT) bestT = t;
        if (t < firstT) firstT = t;
      }
      const found = covering.length ? covering : byTime.get(bestT >= 0 ? bestT : firstT) ?? [];
      // one stop per paragraph, in reading order
      const blocks = [...new Set(found.map((a) => a.closest("p, li, blockquote, h2, h3, h4, td, pre") ?? a))]
        .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      if (!blocks.length) { player.status("筆記中沒有對應目前影片的段落"); return; }
      const same = blocks.length === cycle.blocks.length && blocks.every((b, i) => b === cycle.blocks[i]);
      cycle = { blocks, i: same ? (cycle.i + 1) % blocks.length : 0 };
      const block = blocks[cycle.i];
      const top = block.getBoundingClientRect().top + window.scrollY - box.offsetHeight - 24;
      window.scrollTo({ top, behavior: notesScroll() });
      block.classList.remove("flash"); void block.offsetWidth; block.classList.add("flash");
      // where we landed: the section heading above the paragraph
      let h = block.closest("h2") ? block : null;
      for (let el = block; !h && el && el !== body; el = el.previousElementSibling ?? el.parentElement)
        if (el.tagName === "H2") h = el;
      const n = blocks.length > 1 ? `${cycle.i + 1}/${blocks.length}` : "";
      toNoteN.textContent = n ? ` ${n}` : "";
      clearTimeout(nTimer);
      nTimer = setTimeout(() => { toNoteN.textContent = ""; }, 8000);
      player.status(`已跳到筆記${h ? "「" + h.textContent.replace(/〔[^〕]*〕/g, "").trim() + "」" : ""}${n ? `，第 ${n} 處，再點跳下一處` : ""}`);
    });
  }

  // ---------- TOC highlight ----------
  const links = [...document.querySelectorAll(".toc a")];
  if (links.length && "IntersectionObserver" in window) {
    const byId = new Map(links.map((l) => [l.hash.slice(1), l]));
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove("on"));
        byId.get(e.target.id)?.classList.add("on");
      }
    }, { rootMargin: `-${box?.offsetHeight ?? 0}px 0px -60% 0px` });
    body.querySelectorAll("h2[id]").forEach((h) => io.observe(h));
  }
})();
