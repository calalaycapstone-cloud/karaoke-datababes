import { store } from "./storage.js";
export const CATEGORIES = [
  ["Popular", "popular hits"],
  ["Trending", "trending 2025"],
  ["OPM", "OPM"],
  ["Pop", "pop"],
  ["Rock", "rock"],
  ["R&B", "r&b"],
  ["Love songs", "love songs"],
  ["Ballads", "ballads"],
  ["80s", "80s hits"],
  ["90s", "90s hits"],
  ["2000s", "2000s hits"],
  ["2010s", "2010s hits"],
  ["2020s", "2020s hits"],
];
export function parseSong(i) {
  const t = i.title
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(
      /karaoke|instrumental|with lyrics|lyrics|sing along|version|\bhd\b|\b4k\b|\bno vocals?\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const [a, ...r] = t.split(/\s[-–|:]\s/);
  return {
    id: i.id,
    thumb: i.thumb,
    title: i.title,
    artist: (r.length ? a : i.channel).trim(),
    track: (r.length ? r.join(" ") : a).trim(),
  };
}
export async function searchSongs(q) {
  const key = "cache:" + q.toLowerCase(),
    hit = store.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v; // saves YouTube API quota
  const r = await fetch("/api/search?q=" + encodeURIComponent(q));
  let d;
  try {
    d = await r.json();
  } catch {
    throw new Error(
      "Search API unavailable. Run with `vercel dev` or deploy to Vercel.",
    );
  }
  if (!r.ok) throw new Error(d.error || "Search failed");
  const v = d.items.map(parseSong);
  store.set(key, { t: Date.now(), v });
  return v;
}
