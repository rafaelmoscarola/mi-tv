import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// En Smart TV fuerza un modo de conexión más compatible; en el resto lo detecta solo
const smartTv = /Tizen|Web0S|webOS|SmartTV|SMART-TV|BRAVIA|NetCast|HbbTV|AFT|CrKey|Android TV|GoogleTV|VIDAA/i.test(navigator.userAgent);
export const db = initializeFirestore(
  app,
  smartTv ? { experimentalForceLongPolling: true } : { experimentalAutoDetectLongPolling: true }
);
export const googleProvider = new GoogleAuthProvider();
