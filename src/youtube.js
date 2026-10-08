// Entiende links de YouTube y los convierte en algo que la tele sabe reproducir.
export function parseYouTube(input) {
  const s = (input || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return { kind: 'video', id: s };

  let u;
  try {
    u = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1, 12);
    return id.length === 11 ? { kind: 'video', id } : null;
  }
  if (host.endsWith('youtube.com')) {
    const v = u.searchParams.get('v');
    if (v) return { kind: 'video', id: v.slice(0, 11) };
    const m = u.pathname.match(/^\/(live|shorts|embed)\/([\w-]{11})/);
    if (m) return { kind: 'video', id: m[2] };
    const c = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
    if (c) return { kind: 'channel', id: c[1] };
    if (u.pathname.startsWith('/@')) return { kind: 'handle', id: u.pathname.split('/')[1] };
  }
  return null;
}

export function embedUrl(item) {
  if (!item) return null;
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    origin: window.location.origin,
  }).toString();
  if (item.kind === 'video') return `https://www.youtube.com/embed/${item.id}?${params}`;
  if (item.kind === 'channel') return `https://www.youtube.com/embed/live_stream?channel=${item.id}&${params}`;
  return null;
}

export function thumbUrl(item) {
  return item?.kind === 'video' ? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg` : null;
}
