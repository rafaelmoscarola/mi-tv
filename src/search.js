// Buscador: compara sin mayúsculas ni tildes, y entiende siglas y apodos comunes
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, ' mas ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Equivalencias: lo que la gente escribe → cómo puede figurar el canal
const ALIASES = {
  tn: ['todo noticias'],
  'todo noticias': ['tn'],
  ln: ['ln mas', 'la nacion'],
  'ln mas': ['la nacion'],
  'la nacion': ['ln mas'],
  c5n: ['c 5 n', 'cinco n'],
  'cinco n': ['c5n'],
  a24: ['america 24'],
  'america 24': ['a24'],
  'tv publica': ['television publica', 'canal 7'],
  'canal 7': ['tv publica'],
  mitre: ['radio mitre'],
  rivadavia: ['radio rivadavia'],
  'la 100': ['la cien'],
  'rock and pop': ['rock pop', 'rock & pop'],
  cronica: ['cronica tv'],
  kun: ['aguero', 'slakun'],
  river: ['river plate'],
  boca: ['boca juniors'],
  futbol: ['deportes'],
  folklore: ['folclore'],
  folclore: ['folklore'],
  noticias: ['noticias'],
};

function variants(q) {
  const base = norm(q);
  const out = new Set([base]);
  for (const [k, list] of Object.entries(ALIASES)) {
    if (base === k || base.includes(k)) list.forEach((v) => out.add(norm(base.replace(k, v))));
  }
  return [...out].filter(Boolean);
}

function matches(hay, variant) {
  const words = variant.split(' ').filter(Boolean);
  return words.every((w) => (w.length <= 2 ? new RegExp(`(^| )${w}( |$)`).test(hay) : hay.includes(w)));
}

export function searchLive(query, live, catalog) {
  if (!query || query.trim().length < 2) return { live: [], offline: [] };
  const vs = variants(query);
  const scored = [];
  for (const it of live || []) {
    const name = norm(it.channel);
    const hay = norm(`${it.channel} ${it.title} ${it.category} ${it.desc || ''}`);
    let score = 0;
    for (const v of vs) {
      if (matches(name, v)) score = Math.max(score, 3); // coincide el canal
      else if (matches(norm(it.title), v)) score = Math.max(score, 2); // el programa
      else if (matches(hay, v)) score = Math.max(score, 1); // categoría o descripción (periodistas)
    }
    if (score) scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.it.viewers || 0) - (a.it.viewers || 0));
  const liveIds = new Set((live || []).map((i) => i.channelId));
  const offline = (catalog || []).filter(
    (c) => !liveIds.has(c.channelId) && vs.some((v) => matches(norm(`${c.name} ${c.handle || ''} ${c.category}`), v))
  );
  return { live: scored.map((s) => s.it), offline: offline.slice(0, 20) };
}
