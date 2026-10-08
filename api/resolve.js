// Convierte cualquier link de YouTube (canal, @usuario o video) en la identidad fija del canal.
const KEY = process.env.YOUTUBE_API_KEY;

async function yt(path) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  try {
    let channelId = null;
    let handle = null;
    const mChannel = q.match(/channel\/(UC[\w-]{22})/);
    const mHandle = q.match(/@([\w.\-]+)/);
    const mVideo = q.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/);

    if (mChannel) channelId = mChannel[1];
    else if (/^UC[\w-]{22}$/.test(q)) channelId = q;
    else if (mHandle) handle = `@${mHandle[1]}`;
    else if (mVideo) {
      const j = await yt(`videos?part=snippet&id=${mVideo[1]}`);
      channelId = j.items?.[0]?.snippet?.channelId || null;
    }
    if (!channelId && !handle) return res.status(400).json({ error: 'No reconozco ese link' });

    const j = await yt(
      channelId ? `channels?part=snippet&id=${channelId}` : `channels?part=snippet&forHandle=${encodeURIComponent(handle)}`
    );
    const ch = j.items?.[0];
    if (!ch) return res.status(404).json({ error: 'No encontré ese canal' });

    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).json({
      channelId: ch.id,
      name: ch.snippet.title,
      handle: ch.snippet.customUrl || handle || '',
      logo: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
