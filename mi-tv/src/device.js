// Decide si este equipo es "la tele" o "el celu"
const SMART_TV = /Tizen|Web0S|webOS|SmartTV|SMART-TV|BRAVIA|NetCast|HbbTV|AFT|CrKey|Android TV|GoogleTV|VIDAA/i;
const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i;

export function isTvDevice() {
  const ua = navigator.userAgent;
  if (SMART_TV.test(ua)) return true;
  if (MOBILE.test(ua)) return false;
  // iPad moderno se presenta como Mac: si tiene pantalla táctil, es tablet
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false;
  return true;
}

// /tv -> tele; /app -> celu; / -> según el equipo (una app instalada en el celu siempre es control)
export function screenMode() {
  const path = window.location.pathname;
  if (path.startsWith('/tv')) return 'tv';
  if (path.startsWith('/app')) return 'app';
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  return !installed && isTvDevice() ? 'tv' : 'app';
}

export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
