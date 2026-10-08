import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useRadar, buildRows, itemKey, sinceText, viewersText, updatedText } from './radar';

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

// Carga una sola vez el reproductor oficial de YouTube
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    if (!document.getElementById('yt-api')) {
      const s = document.createElement('script');
      s.id = 'yt-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

// Botón "Instalar en esta compu": una app instalada puede reproducir con sonido sola
function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches
  );
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  };
  return { canInstall: !!promptEvent && !installed, install };
}

// Imagen en vivo: intenta la versión grande y si no existe usa la normal
function Thumb({ item, big, stamp }) {
  const [failed, setFailed] = useState(false);
  if (!item) return <div className="thumb-ph" />;
  const src = item.kind === 'video' && big && !failed ? item.thumb.replace('hqdefault', 'maxresdefault') : item.thumb;
  return src ? (
    <img src={`${src}${src.includes('?') ? '&' : '?'}t=${stamp || ''}`} alt="" onError={() => setFailed(true)} />
  ) : (
    <div className="thumb-ph" />
  );
}

function Player({ item, volumeRef, onSoundBlocked, playerRef }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let checkTimer = null;
    let liveTimer = null;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const target = document.createElement('div');
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(target);
      const isChannel = item.kind === 'channel';
      playerRef.current = new YT.Player(target, {
        width: '100%',
        height: '100%',
        videoId: isChannel ? 'live_stream' : item.id,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          ...(isChannel ? { channel: item.id } : {}),
        },
        events: {
          onStateChange: (e) => {
            // Auto-vivo: si quedó atrasado respecto del vivo (por ejemplo después de un anuncio), salta al presente
            if (e.data !== 1 || !item.live) return;
            clearInterval(liveTimer);
            const jump = () => {
              try {
                const d = e.target.getDuration();
                const t = e.target.getCurrentTime();
                if (d > 0 && d - t > 25) e.target.seekTo(d, true);
              } catch {}
            };
            jump();
            liveTimer = setInterval(jump, 30000);
          },
          onReady: (e) => {
            e.target.setVolume(volumeRef.current);
            e.target.unMute();
            e.target.playVideo();
            // Si a los 3 segundos no arrancó, el navegador bloqueó el sonido:
            // arrancamos sin sonido y pedimos un solo clic.
            checkTimer = setTimeout(() => {
              const st = e.target.getPlayerState?.();
              if (st !== 1 && st !== 3) {
                e.target.mute();
                e.target.playVideo();
                onSoundBlocked(true);
              }
            }, 3000);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(checkTimer);
      clearInterval(liveTimer);
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
  }, [item.kind, item.id]);

  return <div ref={hostRef} className="tv-player" />;
}

export default function Tv() {
  const [uid, setUid] = useState(null);
  const [screen, setScreen] = useState(undefined);
  const [codeTick, setCodeTick] = useState(0);
  const [showTitle, setShowTitle] = useState(false);
  const [pairError, setPairError] = useState('');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const playerRef = useRef(null);
  const volumeRef = useRef(70);
  const clock = useClock();
  const { canInstall, install } = useInstallPrompt();
  const paired = !!screen?.ownerUid;
  const { data: radar, error: radarError } = useRadar(paired);
  const rows = buildRows(radar?.live);
  const stamp = radar?.updatedAt;
  const cursorKey = itemKey(screen?.cursor);
  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [cursorKey, screen?.mode]);

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
          lastError = e; // puede ser que ese código lo use otra tele: probamos con otro
          console.error(e);
        }
      }
      if (!cancelled && lastError) setPairError(`No se pudo crear el código (${lastError.code || lastError.message})`);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, screen === undefined, screen?.ownerUid, screen?.pairCode, screen?.pairExpires, codeTick]);

  // Ya emparejada: borra el código para que nadie más lo use
  useEffect(() => {
    if (!uid || !screen?.ownerUid || !screen.pairCode) return;
    deleteDoc(doc(db, 'pairCodes', screen.pairCode)).catch(() => {});
    updateDoc(doc(db, 'screens', uid), { pairCode: null, pairExpires: null }).catch(console.error);
  }, [uid, screen?.ownerUid, screen?.pairCode]);

  // Avisa al celu si la tele necesita un clic para el sonido
  useEffect(() => {
    if (!uid || screen === undefined || !screen?.ownerUid) return;
    if (!!screen.soundBlocked !== soundBlocked) {
      updateDoc(doc(db, 'screens', uid), { soundBlocked }).catch(() => {});
    }
  }, [uid, soundBlocked, screen?.ownerUid, screen?.soundBlocked]);

  // Un solo clic o tecla en la tele habilita el sonido para toda la sesión
  useEffect(() => {
    if (!soundBlocked) return;
    const enable = () => {
      try {
        playerRef.current?.unMute();
        playerRef.current?.setVolume(volumeRef.current);
        playerRef.current?.playVideo();
      } catch {}
      setSoundBlocked(false);
    };
    window.addEventListener('pointerdown', enable);
    window.addEventListener('keydown', enable);
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
    };
  }, [soundBlocked]);

  // Muestra el nombre del canal unos segundos cada vez que cambia
  const current = screen?.mode === 'play' ? screen?.current : null;
  const currentKey = current && (current.kind === 'video' || current.kind === 'channel') ? `${current.kind}:${current.id}` : null;
  useEffect(() => {
    if (!currentKey) return;
    setShowTitle(true);
    const t = setTimeout(() => setShowTitle(false), 4000);
    return () => clearTimeout(t);
  }, [currentKey]);

  // Órdenes del control: silencio y volumen
  useEffect(() => {
    const c = screen?.cmd;
    const p = playerRef.current;
    if (!c?.at || Date.now() - c.at > 15000 || !p) return; // ignora órdenes viejas
    try {
      if (c.name === 'mute') p.mute();
      if (c.name === 'unmute') p.unMute();
      if (c.name === 'volUp' || c.name === 'volDown') {
        volumeRef.current = Math.max(0, Math.min(100, volumeRef.current + (c.name === 'volUp' ? 10 : -10)));
        p.unMute();
        p.setVolume(volumeRef.current);
      }
    } catch {}
  }, [screen?.cmd?.at]);

  const installButton = canInstall ? (
    <button className="tv-install" onClick={install}>
      Instalar Mi TV en esta compu
    </button>
  ) : null;

  if (screen === undefined) {
    return (
      <main className="tv tv-center">
        <p className="tv-muted">Conectando…</p>
        {pairError && <p className="tv-error">{pairError}</p>}
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
        {installButton}
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

  if (currentKey) {
    return (
      <main className="tv tv-play">
        <Player key={currentKey} item={current} volumeRef={volumeRef} playerRef={playerRef} onSoundBlocked={setSoundBlocked} />
        <div className={`tv-toast ${showTitle ? 'is-on' : ''}`}>
          <span className="live-dot" />
          {current.title || 'En vivo'}
        </div>
        {soundBlocked && (
          <div className="tv-sound" role="status">
            Hacé un clic en la pantalla para activar el sonido
            <small>Solo hace falta una vez. Instalando Mi TV en esta compu no se vuelve a pedir.</small>
          </div>
        )}
      </main>
    );
  }

  // VISTAZO: la imagen del canal a pantalla grande, sin cargar video ni anuncios
  if (screen.mode === 'peek' && screen.cursor) {
    const it = screen.cursor;
    return (
      <main className="tv tv-peek">
        <Thumb item={it} big stamp={stamp} />
        <div className="peek-info">
          <div className="peek-channel">
            {it.logo && <img src={it.logo} alt="" />}
            <span>{it.channel}</span>
            <span className="live-pill">En vivo</span>
          </div>
          <h1>{it.title}</h1>
          <p>{[viewersText(it.viewers), sinceText(it.startedAt)].filter(Boolean).join('   ')}</p>
          <p className="peek-hint">OK en el celular para ver</p>
        </div>
      </main>
    );
  }

  // INICIO: la grilla con todo lo que está en vivo
  const hero = screen.cursor || rows[0]?.items[0] || null;
  return (
    <main className="tv tv-home">
      <header className="home-head">
        <div className="tv-logo small">
          Mi<span>TV</span>
        </div>
        <div className="home-meta">
          <span className="tv-status">
            <span className="ok-dot" /> Control conectado
          </span>
          {radar && <span className="tv-updated">{updatedText(radar.updatedAt)}</span>}
          <span className="home-clock">{clock}</span>
        </div>
      </header>

      {hero ? (
        <section className="home-hero">
          <div className="hero-img">
            <Thumb item={hero} big stamp={stamp} />
          </div>
          <div className="hero-info">
            <div className="peek-channel">
              {hero.logo && <img src={hero.logo} alt="" />}
              <span>{hero.channel}</span>
              <span className="live-pill">En vivo</span>
            </div>
            <h1>{hero.title}</h1>
            <p>{[viewersText(hero.viewers), sinceText(hero.startedAt)].filter(Boolean).join('   ')}</p>
          </div>
        </section>
      ) : (
        <section className="home-empty">
          {radarError ? (
            <p className="tv-error">El radar no respondió: {radarError}</p>
          ) : radar ? (
            <p className="tv-lead">Ahora no hay nada en vivo en tu catálogo. Agregá canales desde el celular.</p>
          ) : (
            <p className="tv-muted">Buscando qué está en vivo…</p>
          )}
        </section>
      )}

      <div className="home-rows">
        {rows.map((row) => (
          <section key={row.title} className="home-row">
            <h2>{row.title}</h2>
            <div className="row-cards">
              {row.items.map((it) => {
                const k = itemKey(it);
                const sel = k === cursorKey;
                return (
                  <article key={k} ref={sel ? selectedRef : null} className={`tv-card ${sel ? 'is-sel' : ''}`}>
                    <div className="card-img">
                      <Thumb item={it} stamp={stamp} />
                      <span className="live-pill small">En vivo</span>
                    </div>
                    <strong>{it.channel}</strong>
                    <span>{it.title}</span>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {installButton}
    </main>
  );
}
