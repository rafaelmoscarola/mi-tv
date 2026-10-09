import { useEffect, useState } from 'react';
import { isInstalled, isIOS } from './device';

// Tarjeta "Instalá Mi TV en tu celu": botón en Android, instrucciones en iPhone
export function InstallCard({ dismissible }) {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => isInstalled() || (dismissible && localStorage.getItem('mitv-install-hide') === '1'));
  useEffect(() => {
    const on = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const done = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', on);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  if (hidden) return null;
  const ios = isIOS();
  if (!ios && !prompt) return null;

  const close = () => {
    try {
      localStorage.setItem('mitv-install-hide', '1');
    } catch {}
    setHidden(true);
  };

  return (
    <section className="card install">
      <div className="install-head">
        <img src="/icon.svg" alt="" />
        <div>
          <strong>Instalá Mi TV en tu celu</strong>
          <span className="muted small">Queda con su ícono, como cualquier app. Gratis.</span>
        </div>
      </div>
      {ios ? (
        <ol className="ios-steps">
          <li>
            Tocá <strong>Compartir</strong> <span className="ios-icon">⬆︎</span> abajo en Safari.
          </li>
          <li>
            Elegí <strong>Agregar a pantalla de inicio</strong> y después <strong>Agregar</strong>.
          </li>
        </ol>
      ) : (
        <button
          className="btn primary"
          onClick={async () => {
            prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
          }}
        >
          Instalar Mi TV
        </button>
      )}
      {dismissible && (
        <button className="link" onClick={close}>
          Ahora no
        </button>
      )}
    </section>
  );
}

// Guía "¿Cómo la veo en la tele?"
export function TvHelp({ onClose }) {
  const [tab, setTab] = useState('smart');
  return (
    <div className="sheet-bg" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label="Cómo ver Mi TV en la tele" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>¿Cómo la veo en la tele?</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <nav className="tabs">
          <button className={tab === 'smart' ? 'is-on' : ''} onClick={() => setTab('smart')}>Smart TV</button>
          <button className={tab === 'pc' ? 'is-on' : ''} onClick={() => setTab('pc')}>Compu</button>
          <button className={tab === 'otra' ? 'is-on' : ''} onClick={() => setTab('otra')}>Otra tele</button>
        </nav>
        {tab === 'smart' && (
          <ol className="help-steps">
            <li>En la tele, abrí el <strong>navegador</strong> (Internet, Navegador web o similar).</li>
            <li>Escribí <strong className="big-url">mitv.ar</strong> y entrá.</li>
            <li>Guardala como <strong>favorito</strong> o página de inicio, así la próxima vez es un toque.</li>
            <li>En la tele aparece un código de 4 números. En este celu tocá <strong>Conectar tele</strong> y escribilo.</li>
            <li>Cuando la tele diga "¿Estás ahí?", apretá <strong>OK</strong> en el control remoto. ¡Listo!</li>
          </ol>
        )}
        {tab === 'pc' && (
          <ol className="help-steps">
            <li>En la compu conectada a la tele, abrí Chrome y entrá a <strong className="big-url">mitv.ar</strong>.</li>
            <li>Tocá <strong>Instalar Mi TV en esta compu</strong>: queda como un programa más, a pantalla completa.</li>
            <li>Aparece un código de 4 números: en este celu tocá <strong>Conectar tele</strong> y escribilo.</li>
            <li>Desde ahí, manejás todo con el celu como control remoto.</li>
          </ol>
        )}
        {tab === 'otra' && (
          <div className="help-steps">
            <p>
              Si tu tele no tiene navegador, o anda lenta, podés conectarle una compu, un TV Box o un Chromecast con Google TV y seguir los
              pasos de esas pestañas.
            </p>
            <p className="muted">Pronto: mandar el video del celu a cualquier tele con el botón "transmitir" de YouTube.</p>
          </div>
        )}
      </section>
    </div>
  );
}
