// EL RADAR: revisa los canales del catálogo y devuelve solo lo que está EN VIVO ahora.
// Vercel guarda la respuesta 3 minutos y la comparte entre todos los usuarios,
// así la cuota de YouTube no crece aunque haya muchas personas mirando.
const PROJECT = process.env.VITE_FB_PROJECT_ID;
const KEY = process.env.YOUTUBE_API_KEY;

function field(f, k) {
  const v = f?.[k];
  if (!v) return undefined;
  return v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue;
}

async function readCatalog() {
  const out = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/catalog?pageSize=300${
      pageToken ? `&pageToken=${pageToken}` : ''
    }`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo leer el catálogo (${r.status})`);
    const j = await r.json();
    for (const d of j.documents || []) {
      const f = d.fields || {};
      out.push({
        channelId: field(f, 'channelId'),
        name: field(f, 'name') || '',
        logo: field(f, 'logo') || '',
        category: field(f, 'category') || 'Otros',
        priority: Number(field(f, 'priority') || 0),
        always: field(f, 'always') === true,
      });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out.filter((c) => c.channelId);
}

// Últimos videos de un canal por su lista pública (no gasta cuota)
async function recentIds(channelId) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].slice(0, 6).map((m) => m[1]);
  } catch {
    return [];
  }
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const k = i++;
        results[k] = await fn(items[k]);
      }
    })
  );
  return results;
}

// Le pregunta a YouTube el estado de hasta 50 videos por pedido (1 ficha cada 50)
async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${chunk.join(',')}&key=${KEY}`
    );
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.items || []));
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (!KEY) throw new Error('Falta la variable YOUTUBE_API_KEY en Vercel');
    const catalog = await readCatalog();
    const byId = Object.fromEntries(catalog.map((c) => [c.channelId, c]));
    const lists = await pool(catalog, 20, (c) => recentIds(c.channelId));
    const ids = [...new Set(lists.flat())];
    const videos = ids.length ? await videoDetails(ids) : [];

    const now = Date.now();
    const live = [];
    const upcoming = [];
    const liveChannels = new Set();

    for (const v of videos) {
      const c = byId[v.snippet?.channelId];
      if (!c) continue;
      const d = v.liveStreamingDetails || {};
      const state = v.snippet.liveBroadcastContent;
      const base = {
        kind: 'video',
        id: v.id,
        channelId: c.channelId,
        channel: c.name || v.snippet.channelTitle,
        logo: c.logo,
        category: c.category,
        priority: c.priority,
        title: v.snippet.title,
        thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault${state === 'live' ? '_live' : ''}.jpg`,
      };
      if (state === 'live' && !d.actualEndTime) {
        live.push({ ...base, live: true, viewers: Number(d.concurrentViewers || 0), startedAt: d.actualStartTime || null });
        liveChannels.add(c.channelId);
      } else if (state === 'upcoming' && d.scheduledStartTime) {
        const t = Date.parse(d.scheduledStartTime);
        // descarta "salas de espera" que nunca arrancan
        if (t > now - 2 * 3600e3 && t < now + 7 * 86400e3) upcoming.push({ ...base, scheduledAt: d.scheduledStartTime });
      }
    }

    // Canales marcados "24 horas" (noticias, cámaras): se muestran aunque su vivo sea viejo
    for (const c of catalog) {
      if (c.always && !liveChannels.has(c.channelId)) {
        live.push({
          kind: 'channel',
          id: c.channelId,
          channelId: c.channelId,
          channel: c.name,
          logo: c.logo,
          category: c.category,
          priority: c.priority,
          title: 'En vivo las 24 horas',
          thumb: c.logo,
          live: true,
          always: true,
          viewers: 0,
        });
      }
    }

    upcoming.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=120');
    res.status(200).json({ updatedAt: new Date().toISOString(), channels: catalog.length, live, upcoming });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(500).json({ error: String(e.message || e) });
  }
}
