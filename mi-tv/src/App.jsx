import Tv from './Tv.jsx';
import Control from './Control.jsx';
import { screenMode } from './device';

// mitv.ar se adapta solo: en el celu muestra la app; en un Smart TV o en la compu, la tele
export default function App() {
  return screenMode() === 'tv' ? <Tv /> : <Control />;
}
