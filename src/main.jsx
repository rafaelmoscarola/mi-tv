import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// La pantalla de la tele se instala como una app aparte del control del celu
if (window.location.pathname.startsWith('/tv')) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = '/manifest-tv.webmanifest';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
