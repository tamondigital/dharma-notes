// Docked YouTube player shared by the note reader and the transcript page.
// window.notesPlayer(box, videoId) -> { ensure, play, onTime, status }
// window.notesFollow(player, rows, opt): mark the row being spoken and keep it in view
// scrolls the reader triggers itself: instant when the user asks for reduced motion
window.notesScroll = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
// the reader moved the page or panel by hand: wheel, touch, scroll keys
window.notesOnManualScroll = (el, f) => {
  for (const ev of ["wheel", "touchmove"]) el.addEventListener(ev, f, { passive: true });
  el.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) f();
  });
};
window.notesFmt = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};
window.notesPlayer = (box, videoId) => {
  let yt = null, ready = null, timer = null, started = false, savedAt = 0;
  const listeners = [];

  // where this video was left, on this page or the note/transcript sibling: { t, d, playing, at }
  const posKey = "pos:" + videoId;
  const load = () => { try { return JSON.parse(localStorage.getItem(posKey)) || null; } catch (e) { return null; } };
  const save = (playing) => {
    const t = yt?.getCurrentTime?.(), d = yt?.getDuration?.();
    if (typeof t !== "number" || !started) return;
    const done = d && t > d - 15;
    try {
      if (done || t < 5) localStorage.removeItem(posKey);
      else localStorage.setItem(posKey, JSON.stringify({ t: Math.floor(t), d: Math.floor(d || 0), playing, at: Date.now() }));
    } catch (e) {}
  };
  const saved = load();
  const resumeAt = saved && saved.t > 5 && !(saved.d && saved.t > saved.d - 15) ? saved.t : 0;
  // keep playing across note <-> transcript, or straight into the next lesson
  let autoplay = false;
  try {
    autoplay = (saved?.playing && Date.now() - saved.at < 10 * 60 * 1000) || sessionStorage.getItem("autoplay") === "1";
    sessionStorage.removeItem("autoplay");
  } catch (e) {}

  function ensure() {
    showVideo(true);
    if (ready) return ready;
    ready = new Promise((resolve) => {
      const make = () => {
        yt = new YT.Player(box.querySelector("[data-yt]"), {
          videoId, host: "https://www.youtube-nocookie.com",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: resumeAt || undefined },
          events: {
            onReady: () => {
              resolve(yt);
              if (resumeAt) {
                emit(resumeAt);
                status(`從 ${notesFmt(resumeAt)} 繼續`);
              }
              if (autoplay) yt.playVideo();
            },
            // poll the clock only while playing
            onStateChange: (e) => {
              clearInterval(timer);
              if (e.data === YT.PlayerState.PLAYING) {
                started = true;
                timer = setInterval(tick, 250);
                endCard(false);
              }
              if (e.data === YT.PlayerState.PAUSED) save(false);
              if (e.data === YT.PlayerState.ENDED) { save(false); endCard(true); }
              tick();
            },
          },
        });
      };
      if (window.YT?.Player) return make();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); make(); };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    });
    return ready;
  }
  const emit = (t) => listeners.forEach((f) => f(t));
  function tick() {
    // before the first play the clock reads 0: report the resume point instead
    const t = started ? yt?.getCurrentTime?.() : resumeAt;
    if (typeof t !== "number") return;
    emit(t);
    if (started && yt.getPlayerState?.() === YT.PlayerState.PLAYING && Date.now() - savedAt > 3000) {
      savedAt = Date.now(); save(true);
    }
  }
  async function play(sec) {
    const p = await ensure();
    p.seekTo(sec, true); p.playVideo();
  }
  addEventListener("pagehide", () => { if (started) save(yt?.getPlayerState?.() === YT.PlayerState.PLAYING); });

  // short spoken + visible note under the player ("從 12:34 繼續", "已跳到…")
  const statusEl = box.querySelector("[data-status]");
  let statusTimer = null;
  function status(text) {
    if (!statusEl) return;
    statusEl.textContent = text; statusEl.classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove("show"), 3500);
  }

  // end of video: offer the next lesson over the video area
  let card = null;
  function endCard(on) {
    if (!on) { if (card) card.hidden = true; return; }
    if (!card) {
      card = document.createElement("div");
      card.className = "end-card";
      const next = box.dataset.next;
      card.innerHTML = (next
        ? `<p>本講播放完畢</p><a class="btn btn-next" href="${next}">下一講：${box.dataset.nextTitle} →</a>`
        : `<p>本系列已播放到最後一講</p>`) +
        `<button type="button" class="btn" data-replay>重新播放</button>`;
      card.querySelector(".btn-next")?.addEventListener("click", () => {
        try { sessionStorage.setItem("autoplay", "1"); } catch (e) {}
      });
      card.querySelector("[data-replay]").addEventListener("click", () => play(0));
      box.querySelector(".player-frame").appendChild(card);
    }
    card.hidden = false;
  }

  // anchors (#heading, #L123) scroll to just below the docked player, not behind it
  const root = document.documentElement;
  const setH = () => root.style.setProperty("--player-h", box.offsetHeight + "px");
  setH();
  new ResizeObserver(setH).observe(box);
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();

  // ✕ closes the video down to the bar; the same button, now ▶, shows it again
  function showVideo(open) {
    if (!open) yt?.pauseVideo();
    box.classList.toggle("open", open);
    const btn = box.querySelector("[data-close-player]"), label = open ? "關閉影片" : "顯示影片";
    btn?.setAttribute("aria-label", label);
    if (btn) btn.title = label;
  }
  box.querySelector("[data-close-player]")?.addEventListener("click", () => showVideo(!box.classList.contains("open")));
  const mini = box.querySelector("[data-mini]");
  mini?.addEventListener("click", () => {
    const on = box.classList.toggle("mini"), label = on ? "放大播放器" : "縮小播放器";
    mini.setAttribute("aria-pressed", String(on));
    mini.setAttribute("aria-label", label); mini.title = label;
  });
  const hintBtn = box.querySelector("[data-hint]"), hint = box.querySelector(".player-hint");
  hintBtn?.addEventListener("click", () => {
    hint.hidden = !hint.hidden;
    hintBtn.setAttribute("aria-expanded", String(!hint.hidden));
  });

  return { ensure, play, onTime: (f) => listeners.push(f), status, resumeAt, started: () => started };
};

// rows: [{ el, t, len }] in reading order, t = the row's own time or the last one before it.
// opt: { scroller: element | window, cls, enabled(), top() = px hidden under the player (window only) }
window.notesFollow = (player, rows, opt) => {
  // each row gets a start time: rows sharing one time split it by text length up to the next time
  const n = rows.length, s = new Array(n);
  let prev = 0;
  for (let i = 0; i < n; ) {
    const t0 = Math.max(rows[i].t, prev);
    let j = i + 1;
    while (j < n && rows[j].t <= t0) j++;
    const total = rows.slice(i, j).reduce((a, r) => a + r.len, 0) || 1;
    const t1 = j < n ? rows[j].t : t0 + total / 4;
    for (let k = i, acc = 0; k < j; k++) { s[k] = t0 + (t1 - t0) * acc / total; acc += rows[k].len; }
    prev = t0; i = j;
  }
  const win = opt.scroller === window;
  let active = -1, shown = -1, userScrolled = 0;
  notesOnManualScroll(opt.scroller, () => { userScrolled = Date.now(); });

  function follow(now) {
    let lo = 0, hi = n - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m] <= now) { k = m; lo = m + 1; } else hi = m - 1; }
    if (k < 0) return;
    if (k !== active) {
      rows[active]?.el.classList.remove(opt.cls);
      rows[k].el.classList.add(opt.cls);
      active = k;
    }
    if (!opt.enabled() || Date.now() - userScrolled < 5000) return;
    // not yet played: only the resume point moves the view, and never past a #L link
    if (!player.started() && (!player.resumeAt || (win && location.hash))) return;
    // when a new row starts, bring it to the top of the view
    if (k === shown) return;
    shown = k;
    const el = rows[k].el;
    const top = win ? el.getBoundingClientRect().top + scrollY - opt.top() - 8 : el.offsetTop - 4;
    win ? scrollTo({ top, behavior: notesScroll() }) : opt.scroller.scrollTo({ top, behavior: notesScroll() });
  }
  player.onTime(follow);
  if (player.resumeAt) follow(player.resumeAt);
  return { resume: () => { userScrolled = 0; shown = -1; } };
};
