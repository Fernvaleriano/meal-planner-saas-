import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Mobile/Capacitor build config — outputs to www/ with relative asset paths
// so the native app can load the SPA from the local filesystem.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'www',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'app-test.html')
      }
    }
  }
});
