import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Compila para navegadores más viejos (muchos Smart TV usan versiones antiguas de Chrome)
  build: { target: ['es2017', 'chrome61', 'safari11'] },
});
