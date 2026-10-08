import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { embedUrl } from './youtube';

const CODE_TTL = 10 * 60 * 1000; // el código de emparejar dura 10 minutos

function randomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function Tv() {
  const [uid, setUid] = useState(null);
  const [screen, setScreen] = useState(undefined);
  const [codeTick, setCodeTick] = useState(0);
  const [showTitle, setShowTitle] = useState(false);
  const [pairError, setPairError] = useState('');
  const iframeRef = useRef(null);
  const volumeRef = useRef(70);
  const clock = useClock();

  // La tele entra sola, sin cuenta de Google (sesión anónima que queda guardada en este navegador)
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) setUid(u.uid);
        else signInAnonymously(auth).catch(console.error);
      }),
    []
  );

  // Crea (o reabre) el pizarrón de esta tele y lo escucha
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'screens', uid);
    setDoc(ref, { tvUid: uid, seenAt: serverTimestamp() }, { merge: true }).catch((e) => {
      console.error(e);
      setPairError(`No se pudo crear la pantalla (${e.code || e.message})`);
    });
    return onSnapshot(
      ref,
      (s) => setScreen(s.data() || null),
      (e) => {
        console.error(e);
        setPairError(`No se puede leer la pantalla (${e.code || e.message})`);
      }
    );
  }, [uid]);

  // Mientras no haya celu emparejado, muestra un código y lo renueva cuando vence
  useEffect(() => {
    if (!uid || screen === undefined || screen?.ownerUid) return;
    const fresh = screen?.pairCode && screen.pairExpires > Date.now();
    if (fresh) {
      const t = setTimeout(() => setCodeTick((n) => n + 1), screen.pairExpires - Date.now() + 500);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    (async () => {
      let lastError = null;
      for (let i = 0; i < 6 && !cancelled; i++) {
        const code = randomCode();
        const expires = Date.now() + CODE_TTL;
        try {
          await setDoc(doc(db, 'pairCodes', code), { screenId: uid, expires });
          if (screen?.pairCode && screen.pairCode !== code) {
            deleteDoc(doc(db, 'pairCodes', screen.pairCode)).catch(() => {});
          }
          await setDoc(doc(db, 'screens', uid), { pairCode: code, pairExpires: expires }, { merge: true });
          setPairError('');
          return;
        } catch (e) {
          // puede ser que ese código lo use otra tele: probamos con otro
          lastError = e;
          console.error(e);
        }
      }
      if (!cancelled && lastError) setPairError(`No se pudo crear el código (${lastError.code || lastError.message})`);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, screen?.ownerUid, screen?.pairCode, screen?.pairExpires, codeTick]);

  // Ya emparejada: borra el código para que nadie más lo use
  useEffect(() => {
    if (!uid || !screen?.ownerUid || !screen.pairCode) return;
    deleteDoc(doc(db, 'pairCodes', screen.pairCode)).catch(() => {});
    updateDoc(doc(db, 'screens', uid), { pairCode: null, pairExpires: null }).catch(console.error);
  }, [uid, screen?.ownerUid, screen?.pairCode]);

  // Muestra el nombre del canal unos segundos cada vez que cambia
  const currentKey = screen?.mode === 'play' && screen?.current ? `${screen.current.kind}:${screen.current.id}` : null;
  useEffect(() => {
    if (!currentKey) return;
    setShowTitle(true);
    const t = setTimeout(() => setShowTitle(false), 4000);
    return () => clearTimeout(t);
  }, [currentKey]);

  // Órdenes del control: silencio, volumen
  const send = (func, args = []) =>
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

  useEffect(() => {
    const c = screen?.cmd;
    if (!c?.at || Date.now() - c.at > 15000) return; // ignora órdenes viejas
    if (c.name === 'mute') send('mute');
    if (c.name === 'unmute') send('unMute');
    if (c.name === 'volUp' || c.name === 'volDown') {
      volumeRef.current = Math.max(0, Math.min(100, volumeRef.current + (c.name === 'volUp' ? 10 : -10)));
      send('unMute');
      send('setVolume', [volumeRef.current]);
    }
  }, [screen?.cmd?.at]);

  if (screen === undefined) {
    return (
      <main className="tv tv-center">
        <p className="tv-muted">Conectando…</p>
      </main>
    );
  }

  if (!screen?.ownerUid) {
    return (
      <main className="tv tv-center">
        <div className="tv-logo">
          Mi<span>TV</span>
        </div>
        <p className="tv-lead">Abrí Mi TV en tu celular y escribí este código</p>
        <div className="tv-code" aria-live="polite">
          {screen?.pairCode || '····'}
        </div>
        <p className="tv-muted">El código cambia cada 10 minutos.</p>
        {pairError && <p className="tv-error">{pairError}</p>}
      </main>
    );
  }

  if (screen.mode === 'off') {
    return (
      <main className="tv tv-off">
        <span className="tv-off-clock">{clock}</span>
      </main>
    );
  }

  const src = screen.mode === 'play' ? embedUrl(screen.current) : null;
  if (src) {
    return (
      <main className="tv tv-play">
        <iframe
          key={currentKey}
          ref={iframeRef}
          src={src}
          title={screen.current?.title || 'Mi TV'}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
        <div className={`tv-toast ${showTitle ? 'is-on' : ''}`}>
          <span className="live-dot" />
          {screen.current?.title || 'En vivo'}
        </div>
      </main>
    );
  }

  return (
    <main className="tv tv-center">
      <div className="tv-clock">{clock}</div>
      <p className="tv-lead">Elegí qué ver desde tu celular</p>
      <p className="tv-status">
        <span className="ok-dot" /> Control conectado
      </p>
    </main>
  );
}
