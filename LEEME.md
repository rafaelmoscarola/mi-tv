# Mi TV — Etapa 1: la tele y el control conectados

Objetivo de esta etapa: tocar algo en el celular y que cambie en la tele. Todavía no hay radar ni grilla (eso es la etapa 2). Para probar, se pega el link de cualquier video o vivo de YouTube.

## 1. Firebase (proyecto nuevo, plan gratis)

1. Entrá a console.firebase.google.com y creá un proyecto nuevo llamado **mi-tv** (sin Google Analytics).
2. **Authentication → Método de acceso**: activá **Google** y también **Anónimo** (la tele entra sola como anónima, sin cuenta).
3. **Firestore Database → Crear base de datos**: modo producción, ubicación `southamerica-east1`.
4. **Firestore → Reglas**: borrá lo que hay, pegá todo el contenido del archivo `firestore.rules` y tocá **Publicar**.
5. **Configuración del proyecto → Tus apps → Web (</>)**: registrá la app "Mi TV" y copiá los 6 datos de `firebaseConfig`.

## 2. Código y Vercel

1. Creá un repositorio nuevo en GitHub (ej. `mi-tv`) y subí todos estos archivos.
2. Para probar en tu compu: copiá `.env.example` como `.env`, pegá los 6 datos y corré `npm install` y después `npm run dev`.
3. En Vercel: **Add New → Project**, importá el repo. En **Environment Variables** cargá las 6 variables `VITE_FB_...` con los mismos datos. Deploy.
4. Volvé a Firebase → **Authentication → Configuración → Dominios autorizados** y agregá tu dominio de Vercel (ej. `mi-tv-rafa.vercel.app`).

## 3. Primera prueba

1. En la compu de la tele abrí `https://TU-DOMINIO.vercel.app/tv`. Aparece un código de 4 números.
2. En el celu abrí `https://TU-DOMINIO.vercel.app`, entrá con Google y escribí el código.
3. La tele pasa a "Elegí qué ver desde tu celular".
4. En YouTube, en cualquier vivo (por ejemplo Luzu u Olga): Compartir → Copiar enlace. Pegalo en el control, poné un nombre y tocá **Ver en la tele**.
5. Probá Silencio, Vol +/−, Inicio y Apagar.

Para instalar el control como app en el celu: en Chrome, menú ⋮ → **Agregar a pantalla de inicio**.

## 4. Que la compu arranque sola con Mi TV

1. En el escritorio: clic derecho → Nuevo → Acceso directo. En "ubicación" pegá (todo en una línea, con tu dominio):

   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required https://TU-DOMINIO.vercel.app/tv`

   Nombre: **Mi TV**.
2. Apretá `Windows + R`, escribí `shell:startup` y Enter. Mové el acceso directo a esa carpeta.
3. Configuración de Windows → Sistema → Inicio/apagado y suspensión: en "Suspender" poné **Nunca** (con corriente).
4. Para salir del modo pantalla completa: `Alt + F4`.

La primera vez que abras ese acceso directo vas a ver el código para emparejar; después queda emparejada para siempre en esa compu.

## Si algo falla

- **"No se pudo emparejar"**: revisá que hayas publicado las reglas de `firestore.rules` y que el código no tenga más de 10 minutos.
- **El login de Google no abre**: revisá el paso 2.4 (dominio autorizado).
- **El video no arranca solo en la compu**: abrí la tele con el acceso directo del paso 4 (permite el sonido automático). Abierta a mano, el navegador puede pedir un clic primero.
- **Algunos videos dicen "no disponible"**: hay canales que no permiten verse fuera de YouTube. Probá con otro.
