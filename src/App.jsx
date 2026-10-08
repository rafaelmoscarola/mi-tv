import Tv from './Tv.jsx';
import Control from './Control.jsx';

// /tv = la pantalla grande (compu o Smart TV). Cualquier otra dirección = el control del celu.
export default function App() {
  const isTv = window.location.pathname.startsWith('/tv');
  return isTv ? <Tv /> : <Control />;
}
