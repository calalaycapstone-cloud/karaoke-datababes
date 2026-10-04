import { store } from "./storage.js";
import { searchSongs, CATEGORIES } from "./search.js";
import { getLyrics, activeIndex } from "./lyrics.js";
import { queue } from "./queue.js";
import { initPlayer } from "./player.js";
import { mic, EFFECTS } from "./microphone.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (t) =>
  `${(t / 60) | 0}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const S = {
  vol: 80,
  micVol: 100,
  amt: 50,
  fx: "clean",
  monitor: true,
  ...store.get("settings", {}),
};
const saveS = () => store.set("settings", S);
let player,
  current = null,
  lyr = null,
  lastI = -2,
  offset = 0,
  seeking = false,
  muted = false,
  hist = [];
let favs = store.get("favs", []),
  recent = store.get("recent", []);

/* ---------- UI helpers ---------- */
function toast(m) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = m;
  $("#toasts").append(t);
  setTimeout(() => t.classList.add("out"), 2400);
  setTimeout(() => t.remove(), 2900);
}
const isFav = (s) => favs.some((f) => f.id === s.id);
function showTab(t) {
  $$(".tabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.tab === t),
  );
  $$(".pane").forEach((p) => (p.hidden = p.dataset.tab !== t));
}
$$(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

const applyTheme = (t) => {
  document.documentElement.dataset.theme = t;
  store.set("theme", t);
};
applyTheme(
  store.get(
    "theme",
    matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  ),
);
$("#themeBtn").onclick = () =>
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );

/* ---------- Song lists ---------- */
function card(s, extra) {
  const el = document.createElement("div");
  el.className = "song" + (current?.id === s.id ? " now" : "");
  el.innerHTML =
    '<img alt=""><div class="meta"><b></b><small></small></div><div class="acts"></div>';
  el.querySelector("img").src = s.thumb;
  el.querySelector("b").textContent = s.track;
  el.querySelector("small").textContent = s.artist;
  const acts = el.querySelector(".acts");
  const btn = (txt, title, fn, cls = "") => {
    const b = document.createElement("button");
    b.textContent = txt;
    b.title = title;
    b.className = cls;
    b.onclick = (e) => {
      e.stopPropagation();
      fn(b);
    };
    acts.append(b);
  };
  if (extra) extra.forEach(([t, ti, fn]) => btn(t, ti, fn));
  else {
    btn("＋", "Add to queue", () => {
      queue.add(s);
      toast("Added to queue");
    });
    btn("⤒", "Play next", () => {
      queue.addNext(s);
      toast("Will play next");
    });
    btn(
      "♥",
      "Favorite",
      (b) => {
        toggleFav(s);
        b.classList.toggle("on", isFav(s));
      },
      isFav(s) ? "on" : "",
    );
  }
  el.onclick = () => playSong(s);
  return el;
}
function render(box, songs, empty, extraFn) {
  box.replaceChildren();
  if (!songs.length) {
    const p = document.createElement("p");
    p.className = "none";
    p.textContent = empty;
    box.append(p);
    return;
  }
  songs.forEach((s, i) => box.append(card(s, extraFn?.(s, i))));
}
const renderFavs = () =>
  render($("#favList"), favs, "No favorites yet. Tap ♥ on any song.");
const renderRecent = () =>
  render($("#recentList"), recent, "Songs you play will show up here.");
const renderQueue = () => {
  $("#qCount").textContent = queue.items.length;
  render(
    $("#queueList"),
    queue.items,
    "Queue is empty. Add songs with ＋.",
    (s, i) => [
      ["▲", "Move up", () => queue.move(i, i - 1)],
      ["▼", "Move down", () => queue.move(i, i + 1)],
      ["✕", "Remove", () => queue.remove(i)],
    ],
  );
};
queue.on(renderQueue);
function toggleFav(s) {
  favs = isFav(s) ? favs.filter((f) => f.id !== s.id) : [s, ...favs];
  store.set("favs", favs);
  toast(isFav(s) ? "Saved to favorites" : "Removed from favorites");
  renderFavs();
  syncFav();
}
const syncFav = () => {
  const b = $("#fav");
  b.textContent = current && isFav(current) ? "♥" : "♡";
  b.classList.toggle("on", !!current && isFav(current));
};

/* ---------- Search & categories ---------- */
async function runSearch(q) {
  showTab("discover");
  const box = $("#results");
  box.innerHTML = '<div class="skel"></div>'.repeat(5);
  try {
    render(box, await searchSongs(q), "No karaoke videos found.");
  } catch (e) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.className = "err";
    p.textContent = e.message;
    box.append(p);
  }
}
CATEGORIES.forEach(([label, q], i) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    $$("#chips button").forEach((x) => x.classList.toggle("on", x === b));
    runSearch(q);
  };
  if (!i) b.classList.add("on");
  $("#chips").append(b);
});
$("#searchForm").onsubmit = (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (q) {
    $$("#chips button").forEach((x) => x.classList.remove("on"));
    runSearch(q);
  }
};

/* ---------- Playback ---------- */
function playSong(s, back) {
  if (current && !back) hist.push(current);
  current = s;
  offset = 0;
  updSync();
  $("#empty").hidden = true;
  player.load(s.id);
  recent = [s, ...recent.filter((x) => x.id !== s.id)].slice(0, 30);
  store.set("recent", recent);
  renderRecent();
  $("#npTitle").textContent = $("#miniTitle").textContent = s.track;
  $("#npArtist").textContent = $("#miniArtist").textContent = s.artist;
  $("#miniImg").src = s.thumb;
  document.title = `${s.track} · Neonoke`;
  syncFav();
  $$("#results .song,#favList .song,#recentList .song").forEach(() => {});
  loadLyrics(s);
}
const next = () => {
  const s = queue.shift();
  s ? playSong(s) : toast("Queue is empty");
};
const prev = () => {
  if (player.time() > 3 || !hist.length) player.seek(0);
  else playSong(hist.pop(), true);
};
async function loadLyrics(s) {
  lyr = null;
  lastI = -2;
  const box = $("#lyLines");
  box.innerHTML = '<p class="muted">Looking for lyrics…</p>';
  const l = await getLyrics(s);
  if (current?.id !== s.id) return;
  lyr = l;
  box.replaceChildren();
  if (!l) {
    box.innerHTML =
      '<p class="muted">No lyrics found for this song. Sing along with the video.</p>';
    return;
  }
  l.lines.forEach((x) => {
    const p = document.createElement("p");
    p.textContent = x.text || "♪";
    box.append(p);
  });
  if (!l.synced) toast("Lyrics found, but not time-synced");
}
function paintLyrics(i) {
  const box = $("#lyLines"),
    ps = box.children;
  [...ps].forEach((p, k) => p.classList.toggle("on", k === i));
  const p = ps[i];
  if (p)
    box.scrollTo({
      top: p.offsetTop - box.clientHeight / 2 + p.clientHeight / 2,
      behavior: "smooth",
    });
}
const updSync = () =>
  ($("#syncV").textContent =
    `sync ${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`);
$("#syncM").onclick = () => {
  offset -= 0.5;
  updSync();
};
$("#syncP").onclick = () => {
  offset += 0.5;
  updSync();
};

const setPlayIcon = (p) => {
  $("#play").textContent = $("#miniPlay").textContent = p ? "⏸" : "▶";
};
$("#play").onclick = $("#miniPlay").onclick = () =>
  current ? player.toggle() : next();
$("#next").onclick = $("#miniNext").onclick = next;
$("#prev").onclick = prev;
$("#fav").onclick = () => current && toggleFav(current);
$("#seek").oninput = () => (seeking = true);
$("#seek").onchange = (e) => {
  player.seek((e.target.value / 1000) * player.dur());
  seeking = false;
};
function setVol(v) {
  S.vol = +v;
  $("#vol").value = $("#vol2").value = v;
  player?.vol(+v);
  $("#mute").textContent = muted || +v === 0 ? "🔇" : "🔊";
  saveS();
}
$("#vol").oninput = (e) => setVol(e.target.value);
$("#vol2").oninput = (e) => setVol(e.target.value);
const toggleMute = () => {
  muted = !muted;
  player.mute(muted);
  setVol(S.vol);
};
$("#mute").onclick = toggleMute;
const toggleFs = () => {
  const st = $("#stage");
  if (document.fullscreenElement) document.exitFullscreen();
  else if (st.requestFullscreen) st.requestFullscreen();
  else st.classList.toggle("pfs");
};
$("#fs").onclick = toggleFs;

/* ---------- Mini player ---------- */
new IntersectionObserver(
  ([e]) => {
    $("#mini").hidden = e.isIntersecting || !current;
  },
  { threshold: 0.05 },
).observe($("#stage"));
$(".mini").onclick = (e) => {
  if (!e.target.closest("button"))
    $("#stage").scrollIntoView({ behavior: "smooth" });
};

/* ---------- Microphone studio ---------- */
Object.entries(EFFECTS).forEach(([k, e]) => {
  const b = document.createElement("button");
  b.textContent = e.label;
  b.dataset.fx = k;
  b.onclick = () => setFx(k);
  $("#fxGrid").append(b);
});
function setFx(k) {
  S.fx = mic.fx = k;
  $$("#fxGrid button").forEach((b) =>
    b.classList.toggle("on", b.dataset.fx === k),
  );
  mic.rewire();
  saveS();
}
$("#amt").oninput = (e) => {
  S.amt = +e.target.value;
  mic.amt = S.amt / 100;
  saveS();
};
$("#amt").onchange = () => mic.rewire();
$("#micVol").oninput = (e) => {
  S.micVol = +e.target.value;
  mic.vol = S.micVol / 100;
  mic.apply();
  saveS();
};
$("#monitor").onchange = (e) => {
  S.monitor = mic.monitor = e.target.checked;
  mic.apply();
  saveS();
  if (mic.monitor && mic.on)
    toast("Monitoring on. Use headphones to avoid feedback.");
};
$("#micBtn").onclick = async () => {
  const b = $("#micBtn");
  if (mic.on) {
    mic.stop();
    b.textContent = "Turn on microphone";
    b.classList.remove("live");
    $("#latency").textContent = "";
    return toast("Microphone off");
  }
  try {
    await mic.start();
    b.textContent = "Microphone live. Tap to stop";
    b.classList.add("live");
    setTimeout(
      () =>
        ($("#latency").textContent =
          `Estimated audio latency: ${mic.latencyMs() || "~20-60"} ms. Wired headphones give the lowest delay.`),
      400,
    );
    toast("Microphone is live");
  } catch (e) {
    toast(e.message);
    $("#micHint").textContent = e.message;
  }
};
if (!mic.supported()) {
  $("#micBtn").disabled = true;
  $("#micHint").textContent =
    "Your browser does not support microphone processing. Try a recent Chrome, Edge, Firefox, or Safari over HTTPS.";
}
Object.assign(mic, {
  amt: S.amt / 100,
  vol: S.micVol / 100,
  monitor: S.monitor,
  fx: S.fx,
});
$("#amt").value = S.amt;
$("#micVol").value = S.micVol;
$("#monitor").checked = S.monitor;
setFx(S.fx);

/* ---------- Visualizer ---------- */
const cv = $("#viz"),
  g = cv.getContext("2d");
function drawViz(now) {
  const dpr = devicePixelRatio || 1,
    w = cv.clientWidth * dpr,
    h = cv.clientHeight * dpr;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  g.clearRect(0, 0, w, h);
  const fa = mic.freq(),
    wa = mic.wave(),
    N = 56,
    bw = w / (N * 2);
  g.fillStyle =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ac")
      .trim() || "#d9a441";
  for (let i = 0; i < N; i++) {
    const v = fa
        ? fa[Math.floor(i * 1.6) + 2] / 255
        : 0.06 + 0.05 * Math.sin(now / 500 + i * 0.35),
      bh = Math.max(3, v * h * 0.85);
    g.fillRect(w / 2 + i * bw, h - bh, bw - 2, bh);
    g.fillRect(w / 2 - (i + 1) * bw, h - bh, bw - 2, bh);
  }
  if (wa) {
    g.beginPath();
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 2 * dpr;
    wa.forEach((v, i) => {
      const x = (i / wa.length) * w,
        y = h / 2 + ((v - 128) / 128) * h * 0.3;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  drawViz(now);
  if (!player) return;
  const t = player.time(),
    d = player.dur();
  if (!seeking) $("#seek").value = d ? (t / d) * 1000 : 0;
  $("#cur").textContent = fmt(t);
  $("#dur").textContent = fmt(d);
  if (lyr?.synced) {
    const i = activeIndex(lyr.lines, t + offset);
    if (i !== lastI) {
      lastI = i;
      paintLyrics(i);
    }
  }
}

/* ---------- Keyboard ---------- */
addEventListener("keydown", (e) => {
  if (
    !player ||
    e.target.matches("input[type=text],input:not([type]),textarea") ||
    e.ctrlKey ||
    e.metaKey
  )
    return;
  const k = e.key.toLowerCase(),
    act = {
      " ": () => $("#play").click(),
      arrowright: () => player.seek(player.time() + 5),
      arrowleft: () => player.seek(Math.max(0, player.time() - 5)),
      arrowup: () => setVol(Math.min(100, S.vol + 5)),
      arrowdown: () => setVol(Math.max(0, S.vol - 5)),
      m: toggleMute,
      f: toggleFs,
      n: next,
      p: prev,
      l: () => current && toggleFav(current),
    }[k];
  if (act) {
    e.preventDefault();
    act();
  }
});

/* ---------- Boot ---------- */
$("#qShuffle").onclick = () => {
  queue.shuffle();
  toast("Queue shuffled");
};
$("#qClear").onclick = () => {
  queue.clear();
  toast("Queue cleared");
};
$("#rClear").onclick = () => {
  recent = [];
  store.set("recent", recent);
  renderRecent();
};
renderFavs();
renderRecent();
renderQueue();
setVol(S.vol);
initPlayer("yt", {
  state: (s) => {
    setPlayIcon(s === 1);
    if (s === 0) next();
  },
  error: (c) => {
    toast(
      [101, 150].includes(c)
        ? "The uploader blocks embedding. Skipping to next."
        : "Video unavailable. Skipping to next.",
    );
    next();
  },
}).then((p) => {
  player = p;
  player.vol(S.vol);
  requestAnimationFrame(loop);
});
runSearch(CATEGORIES[0][1]);
