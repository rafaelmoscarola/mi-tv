// Mensaje para compartir Mi TV (WhatsApp y demás)
export const SHARE_URL = 'https://mitv.ar';
export const SHARE_TEXT = `Basta de saltar de canal en canal en YouTube buscando quién está en vivo 😮‍💨

Mi TV junta TODOS los streams en un solo lugar: Olga, Luzu, Bondi, Blender, Carajo, Gelatina, Vorterix, La Casa y muchos más 🔴

👉 Solo ves lo que está en vivo AHORA
👉 Zapping entre streams como si fuera el cable
👉 Lo mirás en el celu y con un toque lo mandás a la tele

Gratis 🙌 Entrá a mitv.ar y armá tu propia tele de streamers 📺`;

export async function shareApp() {
  // En el celu abre el menú de compartir del teléfono; si no se puede, va directo a WhatsApp
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mi TV', text: SHARE_TEXT, url: SHARE_URL });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT}\n${SHARE_URL}`)}`, '_blank');
}
