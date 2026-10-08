import { useEffect, useState } from 'react';
import { CATEGORIES } from './categories';

// Pide al radar lo que está en vivo, cada 2 minutos
export function useRadar(enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch('/api/radar');
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        if (!stop) {
          setData(j);
          setError('');
        }
      } catch (e) {
        if (!stop) setError(String(e.message || e));
      }
    };
    load();
    const t = setInterval(load, 120000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [enabled]);
  return { data, error };
}

// Arma las filas: categorías en orden, y dentro de cada una, los más vistos primero
export function buildRows(live) {
  const by = {};
  for (const it of live || []) (by[it.category] ||= []).push(it);
  const order = [...CATEGORIES, ...Object.keys(by).filter((c) => !CATEGORIES.includes(c))];
  const rows = [];
  for (const cat of order) {
    const items = by[cat];
    if (!items?.length) continue;
    items.sort((a, b) => (b.viewers || 0) - (a.viewers || 0) || (b.priority || 0) - (a.priority || 0));
    rows.push({ title: cat, items });
  }
  return rows;
}

export const flatten = (rows) => rows.flatMap((r) => r.items);
export const itemKey = (it) => (it ? `${it.kind}:${it.id}` : '');

export function sinceText(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return `Al aire hace ${min} min`;
  const h = Math.floor(min / 60);
  return `Al aire hace ${h} h ${min % 60} min`;
}

export function viewersText(n) {
  if (!n) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil mirando`;
  return `${n} mirando`;
}

export function updatedText(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? 'Actualizado recién' : `Actualizado hace ${min} min`;
}
