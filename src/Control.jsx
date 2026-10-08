import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { parseYouTube, thumbUrl } from './youtube';

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
    } catch (e) {
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
    } catch (e) {
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
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const screenRef = doc(db, 'screens', profile.screenId);
  const recent = profile.recent || [];

  const write = (data) => updateDoc(screenRef, { ...data, updatedAt: serverTimestamp() }).catch(() => setMsg('No llegó a la tele. Revisá la conexión.'));
  const cmd = (name) => write({ cmd: { name, at: Date.now() } });

  const play = async (item) => {
    setMsg('');
    await write({ mode: 'play', current: item });
    const next = [item, ...recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 8);
    setDoc(doc(db, 'users', user.uid), { recent: next }, { merge: true });
  };

  const sendLink = () => {
    const item = parseYouTube(link);
    if (!item) return setMsg('No reconozco ese link. Pegá el link de un video o de un vivo de YouTube.');
    if (item.kind === 'handle') return setMsg('Los links de canal con @ se activan con el radar (etapa 2). Por ahora pegá el link del vivo o del video.');
    play({ ...item, title: name.trim() || 'Video de YouTube' });
    setLink('');
    setName('');
  };

  const unpair = async () => {
    if (!confirm('¿Desvincular esta tele? Vas a necesitar un código nuevo para volver a emparejarla.')) return;
    await updateDoc(screenRef, { ownerUid: null, mode: 'home', current: null }).catch(() => {});
    await setDoc(doc(db, 'users', user.uid), { screenId: null }, { merge: true });
  };

  const now = screen?.mode === 'play' ? screen?.current : null;

  return (
    <Shell>
      <section className="now">
        {now && thumbUrl(now) ? <img src={thumbUrl(now)} alt="" /> : <div className="now-ph" />}
        <div>
          <span className="now-label">{screen?.mode === 'off' ? 'Tele apagada' : now ? 'En la tele ahora' : 'Tele en inicio'}</span>
          <strong>{now?.title || (screen?.mode === 'off' ? 'Pantalla en negro' : 'Nada reproduciéndose')}</strong>
        </div>
      </section>

      {screen?.soundBlocked && (
        <p className="notice">La tele arrancó sin sonido: hacé un clic en la pantalla de la compu (solo una vez). Instalando Mi TV en la compu no se vuelve a pedir.</p>
      )}

      <section className="pad">
        <button className="btn" onClick={() => write({ mode: 'home' })}>Inicio</button>
        <button className="btn" onClick={() => cmd('mute')}>Silencio</button>
        <button className="btn" onClick={() => cmd('unmute')}>Con sonido</button>
        <button className="btn" onClick={() => cmd('volDown')}>Vol −</button>
        <button className="btn" onClick={() => cmd('volUp')}>Vol +</button>
        <button className="btn danger" onClick={() => write({ mode: 'off' })}>Apagar</button>
      </section>

      <section className="card">
        <h2>Mandar a la tele</h2>
        <p className="muted small">Prueba de la etapa 1: pegá el link de cualquier video o vivo de YouTube.</p>
        <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link de YouTube" aria-label="Link de YouTube" />
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional), ej. Luzu" aria-label="Nombre" />
        <button className="btn primary" onClick={sendLink}>Ver en la tele</button>
        {msg && <p className="error">{msg}</p>}
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2>Recientes</h2>
          <ul className="recent">
            {recent.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <button onClick={() => play(r)}>
                  {thumbUrl(r) ? <img src={thumbUrl(r)} alt="" /> : <span className="thumb-ph" />}
                  <span>{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="ctl-foot">
        <button className="link" onClick={unpair}>Desvincular tele</button>
        <button className="link" onClick={() => signOut(auth)}>Salir</button>
      </footer>
    </Shell>
  );
}
