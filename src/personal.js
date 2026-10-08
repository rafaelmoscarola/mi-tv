import { doc, updateDoc, increment, FieldPath } from 'firebase/firestore';
import { CATEGORIES } from './categories';
import { itemKey } from './radar';

// Puntaje de un canal para un usuario: favorito + cuánto lo mira + si suele mirarlo a esta hora + popularidad
export function scoreOf(it, prefs) {
  const st = prefs?.stats?.[it.channelId];
  const hour = new Date().getHours();
  const fav = prefs?.favorites?.includes(it.channelId) ? 1000 : 0;
  const atHour = (st?.h?.[`h${hour}`] || 0) + (st?.h?.[`h${(hour + 23) % 24}`] || 0);
  return fav + (st?.m || 0) * 2 + atHour * 5 + Math.log10(1 + (it.viewers || 0)) * 10;
}

// Arma las filas personalizadas para un usuario
export function personalRows(live, prefs, showAll) {
  live = live || [];
  const favs = new Set(prefs?.favorites || []);
  const stats = prefs?.stats || {};
  const hour = new Date().getHours();
  const sorted = (arr) => [...arr].sort((a, b) => scoreOf(b, prefs) - scoreOf(a, prefs));
  const rows = [];

  const fav = sorted(live.filter((i) => favs.has(i.channelId)));
  if (fav.length) rows.push({ title: 'Favoritos', items: fav });

  const recent = prefs?.recentlyWatched || [];
  if (recent.length) {
    const liveByChannel = new Map(live.map((i) => [i.channelId, i]));
    const items = recent.map((r) => liveByChannel.get(r.channelId) || { ...r, kind: 'offline', id: r.channelId, offline: true });
    items.sort((a, b) => (a.offline ? 1 : 0) - (b.offline ? 1 : 0));
    rows.push({ title: 'Vistos recientemente', items });
  }

  const atHour = sorted(
    live.filter((i) => {
      const h = stats[i.channelId]?.h || {};
      return (h[`h${hour}`] || 0) + (h[`h${(hour + 23) % 24}`] || 0) >= 10 && !favs.has(i.channelId);
    })
  );
  if (atHour.length) rows.push({ title: 'A esta hora solés ver', items: atHour });

  const watched = live.filter((i) => (stats[i.channelId]?.m || 0) >= 5 && !favs.has(i.channelId));
  if (watched.length) rows.push({ title: 'Para vos', items: sorted(watched).slice(0, 12) });

  // Te puede interesar: canales en vivo de tus categorías más vistas que todavía no probaste
  const catMinutes = {};
  for (const s of Object.values(stats)) if (s?.c) catMinutes[s.c] = (catMinutes[s.c] || 0) + (s.m || 0);
  const topCats = Object.entries(catMinutes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((x) => x[0]);
  const fresh = sorted(live.filter((i) => topCats.includes(i.category) && !stats[i.channelId]));
  if (fresh.length) rows.push({ title: 'Te puede interesar', items: fresh.slice(0, 12) });

  // Categorías: solo las elegidas (salvo "Todas las categorías"); "Lo más visto" siempre
  const mine = prefs?.categories?.length && !showAll ? prefs.categories : null;
  const by = {};
  for (const it of live) {
    if (mine && !mine.includes(it.category) && it.category !== 'Lo más visto') continue;
    (by[it.category] ||= []).push(it);
  }
  const order = [...CATEGORIES, ...Object.keys(by).filter((c) => !CATEGORIES.includes(c))];
  for (const cat of order) if (by[cat]?.length) rows.push({ title: cat, items: sorted(by[cat]) });
  return rows;
}

// Lista para el zapping: todo lo que está en vivo, en el orden de las filas, sin repetir
export function zapList(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows)
    for (const it of r.items) {
      if (it.offline) continue;
      const k = itemKey(it);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(it);
      }
    }
  return out;
}

// Suma un minuto mirado a un canal (y a la hora del día)
export function logMinute(db, uid, it) {
  if (!uid || !it?.channelId) return Promise.resolve();
  const h = `h${new Date().getHours()}`;
  return updateDoc(
    doc(db, 'users', uid),
    new FieldPath('stats', it.channelId, 'm'),
    increment(1),
    new FieldPath('stats', it.channelId, 'h', h),
    increment(1),
    new FieldPath('stats', it.channelId, 'c'),
    it.category || '',
    new FieldPath('stats', it.channelId, 'last'),
    Date.now()
  ).catch(() => {});
}

// Agrega un canal a "Vistos recientemente"
export function addRecent(db, uid, prefs, it) {
  if (!uid || !it?.channelId) return Promise.resolve();
  const slim = { channelId: it.channelId, channel: it.channel || '', thumb: it.logo || it.thumb || '', logo: it.logo || '', category: it.category || '' };
  const list = [slim, ...(prefs?.recentlyWatched || []).filter((r) => r.channelId !== it.channelId)].slice(0, 12);
  return updateDoc(doc(db, 'users', uid), { recentlyWatched: list }).catch(() => {});
}
