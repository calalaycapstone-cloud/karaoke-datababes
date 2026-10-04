// Vercel serverless function: keeps the YouTube API key off the client.
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY, q = (req.query.q || '').toString().slice(0, 100);
  if (!key) return res.status(500).json({ error: 'Server is missing YOUTUBE_API_KEY.' });
  if (!q) return res.status(400).json({ error: 'Type something to search.' });
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  Object.entries({ part: 'snippet', type: 'video', maxResults: '12', videoEmbeddable: 'true', videoSyndicated: 'true', q: q + ' karaoke', key })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  try {
    const r = await fetch(u), d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'YouTube API error' });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.json({ items: (d.items || []).map(i => ({ id: i.id.videoId, title: decode(i.snippet.title), channel: decode(i.snippet.channelTitle), thumb: i.snippet.thumbnails.medium.url })) });
  } catch { res.status(502).json({ error: 'Could not reach YouTube.' }); }
}
