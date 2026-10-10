// EL RADAR: revisa los canales del catálogo y devuelve solo lo que está EN VIVO ahora.
// Vercel guarda la respuesta 3 minutos y la comparte entre todos los usuarios,
// así la cuota de YouTube no crece aunque haya muchas personas mirando.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = process.env.VITE_FB_PROJECT_ID;
const KEY = process.env.YOUTUBE_API_KEY;

// Señales 24 horas: en estas categorías el radar busca solo el vivo si no lo encuentra
const AUTO_24H = new Set(['Noticias', 'Radios']);
const DAILY_SEARCH_LIMIT = 40; // tope de búsquedas pagas por día (100 fichas cada una)

// Señales de noticias 24 h cargadas por su @usuario exacto (evita canales equivocados por nombre)
const OFFICIAL_VERSION = 1;
const OFFICIAL_24H = [
  { handle: '@todonoticias', category: 'Noticias' },
  { handle: '@LNmas', category: 'Noticias' },
  { handle: '@A24com', category: 'Noticias' },
  { handle: '@c5n', category: 'Noticias' },
  { handle: '@canal26', category: 'Noticias' },
  { handle: '@IPNoticias', category: 'Noticias' },
  { handle: '@cronicatv', category: 'Noticias' },
  { handle: '@TVPublicaArgentina', category: 'Noticias' },
];

let adminDb = null;
let adminError = '';
function getAdminDb() {
  if (adminDb !== null) return adminDb;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      adminError = 'Falta FIREBASE_SERVICE_ACCOUNT en Vercel';
      return (adminDb = false);
    }
    const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
    adminDb = getFirestore(app);
  } catch (e) {
    adminError = `Llave de servicio inválida: ${e.message}`;
    adminDb = false;
  }
  return adminDb;
}

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
        handle: field(f, 'handle') || '',
        logo: field(f, 'logo') || '',
        category: field(f, 'category') || 'Otros',
        priority: Number(field(f, 'priority') || 0),
        always: field(f, 'always') === true,
        liveVideoId: field(f, 'liveVideoId') || '',
        liveCheckedAt: Number(field(f, 'liveCheckedAt') || 0),
        lastLiveAt: Number(field(f, 'lastLiveAt') || 0),
        addedMs: Date.parse(d.createTime || '') || 0,
        fixCheckedAt: Number(field(f, 'fixCheckedAt') || 0),
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
    return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].slice(0, 15).map((m) => m[1]);
  } catch {
    return [];
  }
}

// Pregunta gratis por la dirección del vivo del canal (servicio público oEmbed de YouTube)
async function liveViaOembed(channelId) {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/channel/${channelId}/live`);
    const r = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`);
    if (!r.ok) return '';
    const j = await r.json();
    const m = String(j.html || '').match(/embed\/([\w-]{11})/);
    return m ? m[1] : '';
  } catch {
    return '';
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

async function yt(path) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

// Estado de hasta 50 videos por pedido (1 ficha cada 50)
async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt(`videos?part=snippet,liveStreamingDetails,status&id=${ids.slice(i, i + 50).join(',')}`);
    out.push(...(j.items || []));
  }
  return out;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function isLive(v) {
  return v?.snippet?.liveBroadcastContent === 'live' && !v.liveStreamingDetails?.actualEndTime;
}

function toItem(v, c) {
  const d = v.liveStreamingDetails || {};
  const state = v.snippet.liveBroadcastContent;
  return {
    kind: 'video',
    id: v.id,
    channelId: c.channelId,
    channel: c.name || v.snippet.channelTitle,
    logo: c.logo,
    category: c.category,
    priority: c.priority,
    title: v.snippet.title,
    desc: String(v.snippet.description || '').slice(0, 400),
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault${state === 'live' ? '_live' : ''}.jpg`,
    live: state === 'live',
    viewers: Number(d.concurrentViewers || 0),
    startedAt: d.actualStartTime || null,
    scheduledAt: d.scheduledStartTime || null,
    embeddable: v.status?.embeddable !== false,
  };
}

export default async function handler(req, res) {
  try {
    if (!KEY) throw new Error('Falta la variable YOUTUBE_API_KEY en Vercel');
    const now = Date.now();
    const catalog = await readCatalog();
    const byId = Object.fromEntries(catalog.map((c) => [c.channelId, c]));
    const is24 = (c) => c.always || AUTO_24H.has(c.category);

    // 1) Videos recientes de cada canal + vivos recordados
    const lists = await pool(catalog, 20, (c) => recentIds(c.channelId));
    const remembered = catalog.map((c) => c.liveVideoId).filter(Boolean);
    let videos = [];
    const ids = [...new Set([...lists.flat(), ...remembered])];
    if (ids.length) videos = await videoDetails(ids);

    const live = [];
    const upcoming = [];
    const liveChannels = new Set();
    const liveVideoOf = {};
    const addVideo = (v) => {
      const c = byId[v.snippet?.channelId];
      if (!c) return;
      if (isLive(v)) {
        if (liveChannels.has(c.channelId) && live.some((x) => x.id === v.id)) return;
        live.push(toItem(v, c));
        liveChannels.add(c.channelId);
        liveVideoOf[c.channelId] ||= v.id;
      } else if (v.snippet.liveBroadcastContent === 'upcoming' && v.liveStreamingDetails?.scheduledStartTime) {
        const t = Date.parse(v.liveStreamingDetails.scheduledStartTime);
        // descarta "salas de espera" que nunca arrancan
        if (t > now - 2 * 3600e3 && t < now + 7 * 86400e3 && !upcoming.some((x) => x.id === v.id)) upcoming.push(toItem(v, c));
      }
    };
    videos.forEach(addVideo);

    const auto = { admin: false, reason: '', checked: 0, searched: 0, searchFound: 0, replaced: [], official: [] };
    auto.checked = catalog.filter((c) => is24(c) && !liveChannels.has(c.channelId)).length;

    // 3) Con la llave de servicio: recordar vivos, buscar los que faltan y corregir canales equivocados
    const db = getAdminDb();
    auto.admin = !!db;
    auto.reason = db ? '' : adminError;
    if (db) {
      const updates = {};
      const touch = (id, data) => (updates[id] = { ...(updates[id] || {}), ...data });

      // recordar el vivo de cada señal 24 h y cuándo se la vio en vivo por última vez
      for (const c of catalog.filter(is24)) {
        const vid = liveVideoOf[c.channelId];
        if (vid) {
          if (vid !== c.liveVideoId) touch(c.channelId, { liveVideoId: vid });
          if (now - c.lastLiveAt > 3600e3) touch(c.channelId, { lastLiveAt: now });
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const budgetRef = db.collection('config').doc('radar');
      const bs = await budgetRef.get();
      const used = bs.exists && bs.data().day === today ? bs.data().searches || 0 : 0;
      let left = Math.max(0, DAILY_SEARCH_LIMIT - used);

      // 0) Alta automática de la lista oficial de señales 24 h (una sola vez por versión)
      if ((bs.exists ? bs.data().officialVersion : 0) !== OFFICIAL_VERSION) {
        for (const o of OFFICIAL_24H) {
          try {
            const ch = (await yt(`channels?part=snippet&forHandle=${encodeURIComponent(o.handle)}`)).items?.[0];
            if (!ch) {
              auto.official.push(`${o.handle}: no encontrado`);
              continue;
            }
            await db.collection('catalog').doc(ch.id).set(
              {
                channelId: ch.id,
                name: ch.snippet.title,
                handle: ch.snippet.customUrl || o.handle,
                logo: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
                category: o.category,
                always: true,
                ...(byId[ch.id] ? {} : { priority: 0, addedAt: new Date() }),
              },
              { merge: true }
            );
            auto.official.push(`${ch.snippet.title}: ok`);
          } catch (e) {
            auto.official.push(`${o.handle}: ${e.message}`);
          }
        }
        await budgetRef.set({ officialVersion: OFFICIAL_VERSION, officialLog: auto.official }, { merge: true });
      }

      // a) búsqueda paga por canal (respaldo), con espera entre intentos
      const stillMissing = catalog.filter((c) => is24(c) && !liveChannels.has(c.channelId));
      const toSearch = stillMissing
        .filter((c) => now - (c.liveCheckedAt || 0) > (c.liveVideoId ? 30 * 60000 : 6 * 3600e3))
        .sort((a, b) => (a.liveCheckedAt || 0) - (b.liveCheckedAt || 0))
        .slice(0, Math.min(left, 5));
      const searchIds = [];
      for (const c of toSearch) {
        try {
          const j = await yt(`search?part=id&channelId=${c.channelId}&eventType=live&type=video&maxResults=1`);
          left -= 1;
          auto.searched += 1;
          const vid = j.items?.[0]?.id?.videoId || '';
          touch(c.channelId, { liveCheckedAt: now, ...(vid ? { liveVideoId: vid } : {}) });
          if (vid) searchIds.push(vid);
        } catch (e) {
          auto.reason = `Búsqueda: ${e.message}`;
          break;
        }
      }
      if (searchIds.length) {
        for (const v of await videoDetails(searchIds)) {
          const before = liveChannels.size;
          addVideo(v);
          if (liveChannels.size > before) auto.searchFound += 1;
        }
      }

      // b) canal equivocado: si en 24 h nunca se lo vio en vivo, busca el vivo por nombre y lo reemplaza
      const suspects = catalog
        .filter((c) => is24(c) && !liveChannels.has(c.channelId))
        .filter((c) => now - Math.max(c.lastLiveAt || 0, c.addedMs || 0) > 24 * 3600e3)
        .filter((c) => now - (c.fixCheckedAt || 0) > 24 * 3600e3)
        .slice(0, Math.min(left, 1));
      for (const c of suspects) {
        try {
          const j = await yt(
            `search?part=snippet&q=${encodeURIComponent(c.name)}&eventType=live&type=video&regionCode=AR&relevanceLanguage=es&maxResults=5`
          );
          left -= 1;
          auto.searched += 1;
          touch(c.channelId, { fixCheckedAt: now });
          const target = norm(c.name);
          const hit = (j.items || []).find((it) => {
            const t = norm(it.snippet?.channelTitle);
            return it.snippet?.channelId !== c.channelId && t && (t.includes(target) || target.includes(t));
          });
          if (hit && !byId[hit.snippet.channelId]) {
            const ch = (await yt(`channels?part=snippet&id=${hit.snippet.channelId}`)).items?.[0];
            if (ch) {
              await db.collection('catalog').doc(ch.id).set({
                channelId: ch.id,
                name: ch.snippet.title,
                handle: ch.snippet.customUrl || '',
                logo: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
                category: c.category,
                priority: c.priority || 0,
                always: c.always || false,
                liveVideoId: hit.id.videoId,
                lastLiveAt: now,
                replacedFrom: c.name,
                addedAt: new Date(),
              });
              await db.collection('catalog').doc(c.channelId).delete();
              delete updates[c.channelId];
              auto.replaced.push(`${c.name} → ${ch.snippet.title}`);
            }
          }
        } catch (e) {
          auto.reason = `Corrección: ${e.message}`;
          break;
        }
      }

      const writes = Object.entries(updates);
      await Promise.all(writes.map(([id, data]) => db.collection('catalog').doc(id).set(data, { merge: true })));
      if (auto.searched) {
        const log = bs.exists && bs.data().day === today ? bs.data().replaced || [] : [];
        await budgetRef.set({ day: today, searches: used + auto.searched, replaced: [...log, ...auto.replaced].slice(-20) }, { merge: true });
      }
    }

    // 4) Señales 24 h cuyo vivo todavía no se encontró: NO se muestran (antes aparecían como "en vivo"
    //    sin un video verificado y al tocarlas no se veía nada). Se informan aparte para el administrador.
    auto.waiting = catalog.filter((c) => is24(c) && !liveChannels.has(c.channelId)).map((c) => c.name);

    // Los vivos que no se pueden ver fuera de YouTube se sacan de la grilla (y se informan aparte)
    const blocked = [
      ...new Map(live.filter((i) => i.embeddable === false).map((i) => [i.channelId, { channelId: i.channelId, channel: i.channel }])).values(),
    ];
    for (let i = live.length - 1; i >= 0; i--) if (live[i].embeddable === false) live.splice(i, 1);
    for (let i = upcoming.length - 1; i >= 0; i--) if (upcoming[i].embeddable === false) upcoming.splice(i, 1);
    auto.blocked = blocked;

    upcoming.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=120');
    res.status(200).json({ updatedAt: new Date().toISOString(), channels: catalog.length, auto, live, upcoming });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(500).json({ error: String(e.message || e) });
  }
}
