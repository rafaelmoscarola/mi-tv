import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { parseYouTube } from './youtube';
import { CATEGORIES } from './categories';
import { useRadar, buildRows, flatten, itemKey, viewersText, updatedText } from './radar';

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
    setDoc(ref, { name: user.displayName || '', email: user.email || '', lastSeen: serverTimestamp() }, { merge: true });
    return onSnapshot(ref, (s) => setProfile(s.data() || {}));
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
  if (!profile.screenId || screenLost) return <Pair user={user} lost={screenLost} />;
  return <Remote user={user} profile={profile} screen={screen} />;
}

function Shell({ children }) {
  return (
    <main className="ctl">
      <header className="ctl-head">
        <div className="logo">
          Mi<span>TV</span>
        </div>
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
        <h1>Tu tele, desde el celular</h1>
        <p className="muted">Entrá con tu cuenta de Google para usar el control.</p>
        <button className="btn primary big" onClick={login}>
          Entrar con Google
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </Shell>
  );
}

function Pair({ user, lost }) {
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
    } catch {
      setError('No se pudo emparejar. Revisá el código y probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <section className="card center">
        <h1>Emparejá tu tele</h1>
        <p className="muted">En la tele abrí la dirección de Mi TV terminada en /tv y escribí acá el código que aparece.</p>
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
          {busy ? 'Emparejando…' : 'Emparejar'}
        </button>
        {error && <p className="error">{error}</p>}
      </section>
      <button className="link" onClick={() => signOut(auth)}>
        Salir de {user.email}
      </button>
    </Shell>
  );
}

function Remote({ user, profile, screen }) {
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('vivo');
  const screenRef = doc(db, 'screens', profile.screenId);
  const isAdmin = !!ADMIN_EMAIL && (user.email || '').toLowerCase() === ADMIN_EMAIL;
  const { data: radar, error: radarError } = useRadar(true);
  const rows = useMemo(() => buildRows(radar?.live), [radar]);
  const list = useMemo(() => flatten(rows), [rows]);

  const write = (data) =>
    updateDoc(screenRef, { ...data, updatedAt: serverTimestamp() }).catch(() => setMsg('No llegó a la tele. Revisá la conexión.'));
  const cmd = (name) => write({ cmd: { name, at: Date.now() } });

  const play = (item) => {
    setMsg('');
    write({ mode: 'play', current: item, cursor: item });
  };

  // Zapping de vistazo: mueve el cursor y muestra la imagen del canal, sin cargar video
  const zap = (dir) => {
    if (!list.length) return setMsg('Todavía no hay canales en vivo para recorrer.');
    const from = itemKey(screen?.cursor || screen?.current);
    const i = list.findIndex((it) => itemKey(it) === from);
    const next = list[(i + dir + list.length) % list.length] || list[0];
    write({ mode: 'peek', cursor: next });
  };
  const ok = () => {
    const it = screen?.cursor;
    if (it) play(it);
  };

  const unpair = async () => {
    if (!confirm('¿Desvincular esta tele? Vas a necesitar un código nuevo para volver a emparejarla.')) return;
    await updateDoc(screenRef, { ownerUid: null, mode: 'home', current: null, cursor: null }).catch(() => {});
    await setDoc(doc(db, 'users', user.uid), { screenId: null }, { merge: true });
  };

  const now = screen?.mode === 'play' ? screen?.current : null;
  const peeking = screen?.mode === 'peek' ? screen?.cursor : null;

  return (
    <Shell>
      <section className="now">
        {(now || peeking)?.thumb ? <img src={(now || peeking).thumb} alt="" /> : <div className="now-ph" />}
        <div>
          <span className="now-label">
            {screen?.mode === 'off' ? 'Tele apagada' : now ? 'En la tele ahora' : peeking ? 'Vistazo' : 'Tele en inicio'}
          </span>
          <strong>{(now || peeking)?.channel || (screen?.mode === 'off' ? 'Pantalla en negro' : 'Grilla de canales')}</strong>
          {(now || peeking)?.title && <span className="now-title">{(now || peeking).title}</span>}
        </div>
      </section>

      {screen?.soundBlocked && (
        <p className="notice">La tele arrancó sin sonido: hacé un clic en la pantalla de la compu (solo una vez).</p>
      )}

      <section className="pad zap">
        <button className="btn" onClick={() => zap(-1)}>Canal −</button>
        <button className="btn primary" onClick={ok} disabled={!peeking}>OK</button>
        <button className="btn" onClick={() => zap(1)}>Canal +</button>
      </section>
      <section className="pad">
        <button className="btn" onClick={() => write({ mode: 'home' })}>Inicio</button>
        <button className="btn" onClick={() => cmd('mute')}>Silencio</button>
        <button className="btn" onClick={() => cmd('unmute')}>Con sonido</button>
        <button className="btn" onClick={() => cmd('volDown')}>Vol −</button>
        <button className="btn" onClick={() => cmd('volUp')}>Vol +</button>
        <button className="btn danger" onClick={() => write({ mode: 'off' })}>Apagar</button>
      </section>
      {msg && <p className="error">{msg}</p>}

      <nav className="tabs">
        <button className={tab === 'vivo' ? 'is-on' : ''} onClick={() => setTab('vivo')}>En vivo</button>
        <button className={tab === 'prox' ? 'is-on' : ''} onClick={() => setTab('prox')}>Próximamente</button>
        {isAdmin && (
          <button className={tab === 'admin' ? 'is-on' : ''} onClick={() => setTab('admin')}>Canales</button>
        )}
      </nav>

      {tab === 'vivo' && (
        <section className="live-list">
          {radarError && <p className="error">El radar no respondió: {radarError}</p>}
          {!radar && !radarError && <p className="muted">Buscando qué está en vivo…</p>}
          {radar && !rows.length && (
            <p className="muted">No hay nada en vivo en tu catálogo ahora.{isAdmin ? ' Cargá canales en la pestaña Canales.' : ''}</p>
          )}
          {radar && <p className="muted small">{updatedText(radar.updatedAt)}</p>}
          {rows.map((row) => (
            <div key={row.title} className="live-group">
              <h2>{row.title}</h2>
              {row.items.map((it) => (
                <button key={itemKey(it)} className="live-item" onClick={() => play(it)}>
                  {it.thumb ? <img src={it.thumb} alt="" /> : <span className="thumb-ph" />}
                  <span className="live-text">
                    <strong>{it.channel}</strong>
                    <span>{it.title}</span>
                    {it.viewers > 0 && <small>{viewersText(it.viewers)}</small>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      {tab === 'prox' && <Upcoming items={radar?.upcoming || []} />}
      {tab === 'admin' && isAdmin && <Admin onPlay={play} />}

      <footer className="ctl-foot">
        <button className="link" onClick={unpair}>Desvincular tele</button>
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
function Admin({ onPlay }) {
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
