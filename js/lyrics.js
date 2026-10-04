// LRCLIB: free, CORS-enabled, no key; returns synced (LRC) and/or plain lyrics.
export async function getLyrics(song) {
  try {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(song.artist + ' ' + song.track));
    const d = await r.json(), hit = d.find(x => x.syncedLyrics) || d.find(x => x.plainLyrics);
    if (!hit) return null;
    if (hit.syncedLyrics) return { synced: true, lines: parseLRC(hit.syncedLyrics) };
    return { synced: false, lines: hit.plainLyrics.split('\n').map(text => ({ t: 0, text })) };
  } catch { return null; }
}
const parseLRC = s => s.split('\n').map(l => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/); return m ? { t: +m[1] * 60 + +m[2], text: m[3].trim() } : null; }).filter(Boolean);
export function activeIndex(lines, time) {
  let lo = 0, hi = lines.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= time) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
