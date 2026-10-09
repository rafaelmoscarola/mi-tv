import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { parseYouTube, embedUrl } from './youtube';
import { CATEGORIES } from './categories';
import { SEED } from './seed';
import { useRadar, itemKey, viewersText, updatedText } from './radar';
import { personalRows, zapList, logMinute, addRecent } from './personal';
import { searchLive } from './search';

// Solo cambia lo que se muestra si el valor se mantiene un rato (evita parpadeos)
function useSteady(value, ms) {
  const [steady, setSteady] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSteady(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return steady;
}

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();

export default function Control() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState(null);
  const [screenLost, setScreenLost] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        // Una sesión anónima es de la pantalla de la tele, no de un celular
        setUser(u && !u.isAnonymous ? u : null);
      }),
    []
  );

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    let ready = false;
    // Espera el perfil completo del servidor antes de mostrar nada (evita el "pestañazo" de categorías)
    return onSnapshot(ref, { includeMetadataChanges: true }, (s) => {
      if (!ready && s.metadata.fromCache) return;
      if (!ready) {
        ready = true;
        setDoc(ref, { name: user.displayName || '', email: user.email || '', lastSeen: serverTimestamp() }, { merge: true });
      }
      setProfile(s.data() || {});
    });
  }, [user]);

  useEffect(() => {
    setScreen(null);
    setScreenLost(false);
    if (!profile?.screenId) return;
    return onSnapshot(
      doc(db, 'screens', profile.screenId),
      (s) => setScreen(s.data() || null),
      () => setScreenLost(true)
    );
  }, [profile?.screenId]);

  if (user === undefined) return <Shell><p className="muted">Cargando…</p></Shell>;
  if (!user) return <Login />;
  if (!profile) return <Shell><p className="muted">Cargando tu perfil…</p></Shell>;
  return <Home user={user} profile={profile} screen={screenLost ? null : screen} screenLost={screenLost} />;
}

function Shell({ children, right }) {
  return (
    <main className="ctl">
      <header className="ctl-head">
        <div className="logo">
          Mi<span>TV</span>
        </div>
        {right}
      </header>
      {children}
    </main>
  );
}

function Login() {
  const [error, setError] = useState('');
  const login = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError('No se pudo entrar con Google. Probá de nuevo.');
    }
  };
  return (
    <Shell>
      <section className="card center">
        <h1>Todo lo que está en vivo, en un solo lugar</h1>
        <p className="muted">Entrá con tu cuenta de Google para empezar.</p>
        <button className="btn primary big" onClick={login}>
          Entrar con Google
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </Shell>
  );
}

// Emparejar una tele (ahora es opcional: la app funciona sola en el celu)
function Pair({ user, lost, onClose }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(lost ? 'Tu tele se desvinculó. Emparejala de nuevo con el código que muestra.' : '');

  const pair = async () => {
    setError('');
    if (!/^\d{4}$/.test(code)) return setError('El código tiene 4 números.');
    setBusy(true);
    try {
      const pc = await getDoc(doc(db, 'pairCodes', code));
      if (!pc.exists() || pc.data().expires < Date.now()) {
        setError('Ese código no existe o venció. Mirá el que muestra la tele ahora.');
        return;
      }
      const screenId = pc.data().screenId;
      await updateDoc(doc(db, 'screens', screenId), { ownerUid: user.uid, claimCode: code, mode: 'home' });
      await setDoc(doc(db, 'users', user.uid), { screenId }, { merge: true });
      onClose?.();
    } catch {
      setError('No se pudo emparejar. Revisá el código y probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card center">
      <h2>Conectar una tele</h2>
      <p className="muted small">
        En la tele (compu o Smart TV) abrí <strong>mi-tv-sand.vercel.app/tv</strong> y escribí acá el código que aparece.
      </p>
      <input
        className="code-input"
        inputMode="numeric"
        maxLength={4}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="0000"
        aria-label="Código de la tele"
      />
      <button className="btn primary big" onClick={pair} disabled={busy}>
        {busy ? 'Conectando…' : 'Conectar'}
      </button>
      {onClose && (
        <button className="link" onClick={onClose}>
          Ahora no
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// Reproductor del celu
function PhonePlayer({ item, flying, onToTv, canTv, onClose, isFav, onFav }) {
  const src = embedUrl(item);
  return (
    <section className={`phone-player ${flying}`}>
      <div className="phone-video">{src && <iframe src={src} title={item.title || item.channel} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}</div>
      <div className="phone-info">
        <div className="phone-text">
          <strong>{item.channel}</strong>
          <span>{item.title}</span>
        </div>
        {item.channelId && (
          <button className={`star inline ${isFav ? 'is-fav' : ''}`} onClick={onFav} aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
            {isFav ? '★' : '☆'}
          </button>
        )}
        <button className="btn primary to-tv" onClick={onToTv}>
          {canTv ? 'Ver en la tele' : 'Conectar tele'}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar reproductor">
          ×
        </button>
      </div>
    </section>
  );
}

// Fila estilo Netflix: se desliza de costado
function Row({ title, items, onPick, activeKey, favorites, onFav }) {
  return (
    <section className="nrow">
      <h2 className="nrow-title">
        {title} <span className="nrow-count">{items.length}</span>
      </h2>
      <div className="nrow-cards">
        {items.map((it) => {
          const fav = favorites.includes(it.channelId);
          return (
            <div key={itemKey(it)} className={`ncard ${itemKey(it) === activeKey ? 'is-on' : ''} ${it.offline ? 'is-off' : ''}`}>
              <button className="ncard-main" onClick={() => !it.offline && onPick(it)} disabled={it.offline}>
                <span className="ncard-img">
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : <span className="thumb-ph" />}
                  {!it.offline && <span className="live-pill tiny">En vivo</span>}
                </span>
                <strong>{it.channel}</strong>
                <small>{it.offline ? 'No está en vivo ahora' : it.title}</small>
              </button>
              {it.channelId && (
                <button
                  className={`star ${fav ? 'is-fav' : ''}`}
                  onClick={() => onFav(it.channelId, !fav)}
                  aria-label={fav ? `Quitar ${it.channel} de favoritos` : `Agregar ${it.channel} a favoritos`}
                >
                  {fav ? '★' : '☆'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Elegir categorías (primer ingreso o "Editar")
function CategoryPicker({ initial, onSave, onSkip }) {
  const [sel, setSel] = useState(initial || []);
  const toggle = (c) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <section className="card">
      <h2>¿Qué te gusta ver?</h2>
      <p className="muted small">Elegí tus categorías. Solo vas a ver esas (más "Lo más visto"), y siempre podés tocar "Todas las categorías".</p>
      <div className="cat-chips">
        {CATEGORIES.filter((c) => c !== 'Lo más visto').map((c) => (
          <button key={c} className={`cat-chip ${sel.includes(c) ? 'is-on' : ''}`} onClick={() => toggle(c)}>
            {c}
          </button>
        ))}
      </div>
      <button className="btn primary" onClick={() => onSave(sel)}>
        Guardar {sel.length ? `(${sel.length})` : ''}
      </button>
      <button className="link" onClick={onSkip}>
        Prefiero ver todas
      </button>
    </section>
  );
}

function Home({ user, profile, screen, screenLost }) {
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('vivo');
  const [pairing, setPairing] = useState(false);
  const [phoneItem, setPhoneItem] = useState(null); // lo que se ve en el celu
  const [flying, setFlying] = useState(''); // animación: 'fly-up' (a la tele) o 'fly-in' (al celu)
  const isAdmin = !!ADMIN_EMAIL && (user.email || '').toLowerCase() === ADMIN_EMAIL;
  const { data: radar, error: radarError } = useRadar(true);
  const [showAll, setShowAll] = useState(false);
  const [editingCats, setEditingCats] = useState(false);
  const rows = useMemo(() => personalRows(radar?.live, profile, showAll), [radar, profile, showAll]);
  const list = useMemo(() => zapList(rows), [rows]);
  const favorites = profile.favorites || [];
  const userRef = doc(db, 'users', user.uid);
  const setFav = (channelId, on) => updateDoc(userRef, { favorites: on ? arrayUnion(channelId) : arrayRemove(channelId) }).catch(() => {});
  const saveCats = (cats) => {
    setDoc(userRef, { categories: cats }, { merge: true });
    setEditingCats(false);
  };
  const needsCats = profile.categories === undefined;

  // Buscador: canales, programas, periodistas y categorías
  const [query, setQuery] = useState('');
  const [catalogAll, setCatalogAll] = useState(null);
  useEffect(() => {
    if (query.trim().length < 2 || catalogAll) return;
    getDocs(collection(db, 'catalog'))
      .then((snap) => setCatalogAll(snap.docs.map((d) => d.data())))
      .catch(() => setCatalogAll([]));
  }, [query, catalogAll]);
  const results = useMemo(() => searchLive(query, radar?.live, catalogAll), [query, radar, catalogAll]);
  const paired = !!profile.screenId && !!screen;
  const screenRef = profile.screenId ? doc(db, 'screens', profile.screenId) : null;
  const tvActive = paired && !phoneItem && (screen?.mode === 'play' || screen?.mode === 'peek');

  // Agrupa los toques rápidos: manda como máximo una orden cada 300 ms (la última gana)
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const lastSentRef = useRef(0);
  const [sentAt, setSentAt] = useState(0);
  const [noAnswer, setNoAnswer] = useState(false);
  const flush = () => {
    timerRef.current = null;
    const data = pendingRef.current;
    pendingRef.current = {};
    if (!screenRef) return;
    const reqAt = Date.now();
    lastSentRef.current = reqAt;
    setSentAt(reqAt);
    setNoAnswer(false);
    updateDoc(screenRef, { ...data, reqAt, updatedAt: serverTimestamp() }).catch(() => setMsg('No llegó a la tele. Revisá la conexión.'));
  };
  const write = (data) => {
    pendingRef.current = { ...pendingRef.current, ...data };
    if (timerRef.current) return;
    const wait = Math.max(0, 300 - (Date.now() - lastSentRef.current));
    timerRef.current = setTimeout(flush, wait);
  };
  const cmd = (name) => write({ cmd: { name, at: Date.now() } });

  const acked = !sentAt || screen?.ack >= sentAt;
  useEffect(() => {
    if (acked) return setNoAnswer(false);
    const t = setTimeout(() => setNoAnswer(true), 5000);
    return () => clearTimeout(t);
  }, [acked, sentAt]);

  const soundNotice = useSteady(!!screen?.soundBlocked, 2500);
  const troubleNotice = useSteady(screen?.trouble || '', 1500);
  const rebooting = (screen?.recentBoots || 0) >= 3 && Date.now() - (screen?.bootAt || 0) < 5 * 60000;
  const notice = !tvActive
    ? ''
    : rebooting
    ? 'La tele se reinició varias veces en pocos minutos: su navegador se está quedando sin memoria. Probá cerrar y abrir el navegador de la tele.'
    : troubleNotice === 'frozen'
    ? 'La tele se está trabando con este video. Probá otro canal.'
    : soundNotice
    ? 'La tele está sin sonido: hacé un clic o apretá OK en el control de la tele (una sola vez).'
    : '';

  const localCursor = useRef(null);
  const [muted, setMuted] = useState(false);

  const phoneId = phoneItem?.channelId || '';
  useEffect(() => {
    if (!phoneItem?.channelId) return;
    addRecent(db, user.uid, profile, phoneItem);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') logMinute(db, user.uid, phoneItem);
    }, 60000);
    return () => clearInterval(t);
  }, [phoneId]);

  // La tele muestra las mismas categorías que el celu
  const toggleAll = () => {
    const v = !showAll;
    setShowAll(v);
    if (paired) write({ showAll: v });
  };

  // Tocar un canal: se ve donde estás mirando (si la tele está activa, en la tele; si no, en el celu)
  const pick = (item) => {
    setMsg('');
    localCursor.current = item;
    if (tvActive) write({ mode: 'play', current: item, cursor: item });
    else {
      setFlying('');
      setPhoneItem(item);
    }
  };

  // "Volar" a la tele: el video del celu se va hacia arriba y arranca en la tele
  const toTv = () => {
    if (!paired) return setPairing(true);
    const item = phoneItem;
    setFlying('fly-up');
    write({ mode: 'play', current: item, cursor: item });
    setTimeout(() => {
      setPhoneItem(null);
      setFlying('');
    }, 550);
  };

  // "Ver en el celu": la tele vuelve a la grilla y el video baja volando al celu
  const toPhone = () => {
    const item = screen?.current || screen?.cursor;
    if (!item) return;
    write({ mode: 'home' });
    setFlying('fly-in');
    setPhoneItem(item);
    setTimeout(() => setFlying(''), 550);
  };

  // Zapping de vistazo en la tele
  const zap = (dir) => {
    if (!list.length) return setMsg('Todavía no hay canales en vivo para recorrer.');
    const from = itemKey(localCursor.current || screen?.cursor || screen?.current);
    const i = list.findIndex((it) => itemKey(it) === from);
    const next = list[(i + dir + list.length) % list.length] || list[0];
    localCursor.current = next;
    write({ mode: 'peek', cursor: next });
  };
  const ok = () => {
    const it = localCursor.current || screen?.cursor;
    if (it) write({ mode: 'play', current: it, cursor: it });
  };

  const unpair = async () => {
    if (!confirm('¿Desvincular esta tele? Vas a necesitar un código nuevo para volver a conectarla.')) return;
    if (screenRef) await updateDoc(screenRef, { ownerUid: null, mode: 'home', current: null, cursor: null }).catch(() => {});
    await setDoc(doc(db, 'users', user.uid), { screenId: null }, { merge: true });
  };

  const onTv = screen?.mode === 'play' ? screen?.current : screen?.mode === 'peek' ? screen?.cursor : null;
  const tvChip = paired ? (
    <span className={`chip ${noAnswer ? 'bad' : 'ok'}`}>{noAnswer ? 'Tele sin respuesta' : 'Tele conectada'}</span>
  ) : (
    <button className="chip action" onClick={() => setPairing(true)}>
      Conectar tele
    </button>
  );

  return (
    <Shell right={tvChip}>
      {(pairing || screenLost) && <Pair user={user} lost={screenLost} onClose={() => setPairing(false)} />}

      {phoneItem && (
        <PhonePlayer
          item={phoneItem}
          flying={flying}
          canTv={paired}
          onToTv={toTv}
          onClose={() => setPhoneItem(null)}
          isFav={favorites.includes(phoneItem.channelId)}
          onFav={() => setFav(phoneItem.channelId, !favorites.includes(phoneItem.channelId))}
        />
      )}

      {tvActive && (
        <section className={`remote ${flying === 'fly-in' ? 'fade-out' : ''}`}>
          <div className="now">
            {onTv?.thumb ? <img src={onTv.thumb} alt="" /> : <div className="now-ph" />}
            <div>
              <span className="now-label">{screen?.mode === 'peek' ? 'Vistazo en la tele' : 'En la tele ahora'}</span>
              <strong>{onTv?.channel || 'Mi TV'}</strong>
              {onTv?.title && <span className="now-title">{onTv.title}</span>}
            </div>
            {onTv?.channelId && (
              <button
                className={`star inline ${favorites.includes(onTv.channelId) ? 'is-fav' : ''}`}
                onClick={() => setFav(onTv.channelId, !favorites.includes(onTv.channelId))}
                aria-label="Favorito"
              >
                {favorites.includes(onTv.channelId) ? '★' : '☆'}
              </button>
            )}
          </div>
          {notice && <p className="notice">{notice}</p>}

          <div className="ctl-group">
            <span className="ctl-label">Canales</span>
            <div className="pad zap">
              <button className="btn" onClick={() => zap(-1)}>Canal −</button>
              <button className="btn primary" onClick={ok}>OK</button>
              <button className="btn" onClick={() => zap(1)}>Canal +</button>
            </div>
          </div>

          <div className="ctl-group">
            <span className="ctl-label">Volumen</span>
            <div className="pad">
              <button className="btn" onClick={() => cmd('volDown')}>Vol −</button>
              <button
                className={`btn ${muted ? 'is-muted' : ''}`}
                onClick={() => {
                  cmd(muted ? 'unmute' : 'mute');
                  setMuted(!muted);
                }}
              >
                {muted ? 'Con sonido' : 'Silencio'}
              </button>
              <button className="btn" onClick={() => cmd('volUp')}>Vol +</button>
            </div>
          </div>

          <button className="btn accent big" onClick={toPhone}>Ver en el celu</button>
          <div className="ctl-actions">
            <button className="btn small" onClick={() => write({ mode: 'home' })}>Inicio</button>
            <button className="btn small danger" onClick={() => write({ mode: 'off' })}>Apagar tele</button>
          </div>
        </section>
      )}

      {paired && !tvActive && !phoneItem && (
        <section className="pad zap">
          <button className="btn" onClick={() => zap(-1)}>Canal −</button>
          <button className="btn" onClick={() => write({ mode: 'home' })}>Inicio tele</button>
          <button className="btn" onClick={() => zap(1)}>Canal +</button>
        </section>
      )}
      {msg && <p className="error">{msg}</p>}

      <nav className="tabs">
        <button className={tab === 'vivo' ? 'is-on' : ''} onClick={() => setTab('vivo')}>En vivo</button>
        <button className={tab === 'prox' ? 'is-on' : ''} onClick={() => setTab('prox')}>Próximamente</button>
        {isAdmin && (
          <button className={tab === 'admin' ? 'is-on' : ''} onClick={() => setTab('admin')}>Canales</button>
        )}
      </nav>

      {tab === 'vivo' && (needsCats || editingCats) && (
        <CategoryPicker initial={profile.categories} onSave={saveCats} onSkip={() => saveCats([])} />
      )}

      {tab === 'vivo' && !needsCats && !editingCats && (
        <div className="search-box">
          <input
            className="field search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar canal, programa o periodista"
            aria-label="Buscar"
          />
          {query && (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Borrar búsqueda">
              ×
            </button>
          )}
        </div>
      )}

      {tab === 'vivo' && !needsCats && !editingCats && query.trim().length >= 2 && (
        <section className="search-results">
          <h2 className="nrow-title">
            En vivo ahora <span className="nrow-count">{results.live.length}</span>
          </h2>
          {!results.live.length && <p className="muted">Nada en vivo que coincida con "{query}".</p>}
          {results.live.map((it) => (
            <button key={itemKey(it)} className="live-item" onClick={() => pick(it)}>
              {it.thumb ? <img src={it.thumb} alt="" /> : <span className="thumb-ph" />}
              <span className="live-text">
                <strong>{it.channel}</strong>
                <span>{it.title}</span>
                <small>
                  {it.category}
                  {it.viewers ? ` · ${viewersText(it.viewers)}` : ''}
                </small>
              </span>
            </button>
          ))}
          {results.offline.length > 0 && (
            <>
              <h2 className="nrow-title muted-title">También en tu catálogo (no en vivo ahora)</h2>
              {results.offline.map((c) => (
                <div key={c.channelId} className="live-item static is-off">
                  {c.logo ? <img src={c.logo} alt="" className="round-logo" /> : <span className="thumb-ph round" />}
                  <span className="live-text">
                    <strong>{c.name}</strong>
                    <small>{c.category}</small>
                  </span>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {tab === 'vivo' && !needsCats && !editingCats && query.trim().length < 2 && (
        <section className="live-rows">
          <div className="cats-bar">
            <button className={`all-btn ${showAll ? 'is-on' : ''}`} onClick={toggleAll}>
              {showAll ? 'Solo mis categorías' : 'Todas las categorías'}
            </button>
            <button className="link" onClick={() => setEditingCats(true)}>
              Mis categorías
            </button>
          </div>
          {radarError && <p className="error">El radar no respondió: {radarError}</p>}
          {!radar && !radarError && <p className="muted">Buscando qué está en vivo…</p>}
          {radar && !rows.length && (
            <p className="muted">No hay nada en vivo en tu catálogo ahora.{isAdmin ? ' Cargá canales en la pestaña Canales.' : ''}</p>
          )}
          {radar && <p className="muted small">{updatedText(radar.updatedAt)}</p>}
          {rows.map((row) => (
            <Row
              key={row.title}
              title={row.title}
              items={row.items}
              onPick={pick}
              activeKey={itemKey(phoneItem || onTv)}
              favorites={favorites}
              onFav={setFav}
            />
          ))}
        </section>
      )}

      {tab === 'prox' && <Upcoming items={radar?.upcoming || []} />}
      {tab === 'admin' && isAdmin && <Admin onPlay={pick} radar={radar} />}

      <footer className="ctl-foot">
        {paired ? (
          <button className="link" onClick={unpair}>Desvincular tele</button>
        ) : (
          <span />
        )}
        <button className="link" onClick={() => signOut(auth)}>Salir</button>
      </footer>
    </Shell>
  );
}

function Upcoming({ items }) {
  if (!items.length) return <p className="muted">Ningún canal del catálogo tiene vivos programados por ahora.</p>;
  const calendarLink = (it) => {
    const start = new Date(it.scheduledAt);
    const end = new Date(start.getTime() + 60 * 60000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${it.channel}: ${it.title}`,
      dates: `${f(start)}/${f(end)}`,
      details: `Mirarlo en Mi TV · https://www.youtube.com/watch?v=${it.id}`,
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  };
  return (
    <section className="live-list">
      {items.map((it) => (
        <div key={it.id} className="live-item static">
          {it.thumb ? <img src={it.thumb} alt="" /> : <span className="thumb-ph" />}
          <span className="live-text">
            <strong>{it.channel}</strong>
            <span>{it.title}</span>
            <small>
              {new Date(it.scheduledAt).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </small>
            <a className="mini-link" href={calendarLink(it)} target="_blank" rel="noreferrer">Recordarme</a>
          </span>
        </div>
      ))}
    </section>
  );
}

// Panel de administrador: cargar, cambiar de categoría y quitar canales
function Admin({ onPlay, radar }) {
  const [catalog, setCatalog] = useState([]);
  const [links, setLinks] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [test, setTest] = useState('');

  useEffect(
    () =>
      onSnapshot(collection(db, 'catalog'), (snap) =>
        setCatalog(snap.docs.map((d) => d.data()).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name)))
      ),
    []
  );

  const add = async () => {
    const lines = links.split(/\s+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    const out = [];
    for (const line of lines) {
      try {
        const r = await fetch(`/api/resolve?q=${encodeURIComponent(line)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error');
        await setDoc(doc(db, 'catalog', j.channelId), {
          channelId: j.channelId,
          name: j.name,
          handle: j.handle,
          logo: j.logo,
          category,
          priority: 0,
          always,
          addedAt: serverTimestamp(),
        });
        out.push({ ok: true, text: `${j.name} → ${category}` });
      } catch (e) {
        out.push({ ok: false, text: `${line}: ${e.message}` });
      }
      setLog([...out]);
    }
    setBusy(false);
    setLinks('');
  };

  const sendTest = () => {
    const item = parseYouTube(test);
    if (!item || item.kind === 'handle') return;
    onPlay({ ...item, channel: 'Prueba', title: 'Link pegado', thumb: item.kind === 'video' ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : '' });
    setTest('');
  };

  return (
    <section className="card">
      <h2>Agregar canales</h2>
      <p className="muted small">Pegá uno o varios links de YouTube (del canal, con @, o de cualquier video del canal), uno por línea.</p>
      <textarea className="field" rows={4} value={links} onChange={(e) => setLinks(e.target.value)} placeholder={'youtube.com/@luzutv\nyoutube.com/@olgaenvivo_'} />
      <label className="field-label">
        Categoría
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
        Transmite las 24 horas (noticias, cámaras, radios)
      </label>
      <button className="btn primary" onClick={add} disabled={busy}>
        {busy ? 'Agregando…' : 'Agregar al catálogo'}
      </button>
      {log.length > 0 && (
        <ul className="log">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? 'ok' : 'bad'}>{l.text}</li>
          ))}
        </ul>
      )}

      <Signals24 catalog={catalog} radar={radar} />

      <Seed catalog={catalog} />

      <h2>Catálogo ({catalog.length})</h2>
      <ul className="catalog">
        {catalog.map((c) => (
          <li key={c.channelId}>
            {c.logo ? <img src={c.logo} alt="" /> : <span className="thumb-ph round" />}
            <span className="cat-text">
              <strong>{c.name}</strong>
              <select
                value={c.category}
                onChange={(e) => updateDoc(doc(db, 'catalog', c.channelId), { category: e.target.value })}
                aria-label={`Categoría de ${c.name}`}
              >
                {CATEGORIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </span>
            <button
              className="link"
              onClick={() => confirm(`¿Quitar ${c.name} del catálogo?`) && deleteDoc(doc(db, 'catalog', c.channelId))}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <h2>Probar un link</h2>
      <input className="field" value={test} onChange={(e) => setTest(e.target.value)} placeholder="Link de un video o vivo" />
      <button className="btn" onClick={sendTest}>Ver en la tele</button>
    </section>
  );
}

// Catálogo sugerido: busca de a 10 y vos confirmás cada uno antes de cargarlo
function Seed({ catalog }) {
  const [done, setDone] = useState(null);
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const configRef = doc(db, 'config', 'seed');

  useEffect(() => onSnapshot(configRef, (s) => setDone(s.data()?.done || []), () => setDone([])), []);

  const pending = done ? SEED.filter((e) => !done.includes(e.q) && !found.some((f) => f.entry.q === e.q)) : [];
  const markDone = (q) => setDoc(configRef, { done: arrayUnion(q) }, { merge: true });

  const searchNext = async () => {
    setBusy(true);
    const batch = pending.slice(0, 10);
    const results = [];
    for (const entry of batch) {
      try {
        const r = await fetch(`/api/resolve?q=${encodeURIComponent(entry.q)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error');
        results.push({ entry, ch: j, already: catalog.some((c) => c.channelId === j.channelId) });
      } catch (e) {
        results.push({ entry, error: e.message });
      }
    }
    setFound((f) => [...f, ...results]);
    setBusy(false);
  };

  const accept = async (r) => {
    await setDoc(doc(db, 'catalog', r.ch.channelId), {
      channelId: r.ch.channelId,
      name: r.ch.name,
      handle: r.ch.handle,
      logo: r.ch.logo,
      category: r.entry.category,
      priority: 0,
      always: !!r.entry.always,
      addedAt: serverTimestamp(),
    });
    await markDone(r.entry.q);
    setFound((f) => f.filter((x) => x !== r));
  };
  const reject = async (r) => {
    await markDone(r.entry.q);
    setFound((f) => f.filter((x) => x !== r));
  };

  if (done === null) return null;
  return (
    <>
      <h2>Catálogo sugerido</h2>
      <p className="muted small">
        {pending.length} canales por revisar. Se buscan de a 10; confirmá que cada uno sea el canal correcto antes de agregarlo.
      </p>
      {pending.length > 0 && (
        <button className="btn" onClick={searchNext} disabled={busy}>
          {busy ? 'Buscando…' : 'Buscar los siguientes 10'}
        </button>
      )}
      {found.some((r) => r.ch && !r.already) && (
        <button
          className="btn primary"
          onClick={async () => {
            for (const r of found.filter((x) => x.ch && !x.already)) await accept(r);
          }}
        >
          Aceptar todos los encontrados
        </button>
      )}
      <ul className="catalog">
        {found.map((r, i) => (
          <li key={i}>
            {r.ch?.logo ? <img src={r.ch.logo} alt="" /> : <span className="thumb-ph round" />}
            <span className="cat-text">
              <strong>{r.ch ? r.ch.name : r.entry.q}</strong>
              <small className="muted">
                {r.error ? `No encontrado (${r.entry.q})` : `${r.entry.category}${r.entry.always ? ' · 24 h' : ''}${r.already ? ' · ya está' : ''} · buscado: ${r.entry.q}`}
              </small>
            </span>
            {r.ch && !r.already && (
              <button className="link" onClick={() => accept(r)}>
                Agregar
              </button>
            )}
            <button className="link" onClick={() => reject(r)}>
              {r.ch && !r.already ? 'No' : 'Listo'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// Estado de las señales 24 horas (solo informativo: el radar trabaja solo)
function Signals24({ catalog, radar }) {
  const liveIds = new Set((radar?.live || []).map((i) => i.channelId));
  const list = catalog.filter((c) => c.always || c.category === 'Noticias' || c.category === 'Radios');
  if (!list.length) return null;
  const on = list.filter((c) => liveIds.has(c.channelId)).length;
  const ago = (ms) => {
    if (!ms) return 'todavía no se lo vio en vivo';
    const h = Math.round((Date.now() - ms) / 3600e3);
    return h < 1 ? 'en vivo hace menos de 1 h' : `visto en vivo hace ${h} h`;
  };
  return (
    <>
      <h2>Señales 24 horas</h2>
      <p className="muted small">
        {on} de {list.length} en vivo ahora. El radar las revisa solo en cada pasada
        {radar?.auto && !radar.auto.admin ? ` (aviso: ${radar.auto.reason})` : ''}.
      </p>
      {radar?.auto?.replaced?.length > 0 && <p className="notice">Corregido automáticamente: {radar.auto.replaced.join(', ')}</p>}
      <ul className="catalog">
        {list.map((c) => (
          <li key={c.channelId}>
            {c.logo ? <img src={c.logo} alt="" /> : <span className="thumb-ph round" />}
            <span className="cat-text">
              <strong>{c.name}</strong>
              <small className="muted">
                {c.category}
                {c.replacedFrom ? ` · reemplazó a "${c.replacedFrom}"` : ''}
              </small>
            </span>
            <span className={`sig ${liveIds.has(c.channelId) ? 'on' : 'off'}`}>
              {liveIds.has(c.channelId) ? 'En vivo' : ago(c.lastLiveAt)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
