import { defineConfig } from 'vite';

// base: './' keeps asset paths relative so the build drops straight into a
// native app shell (Capacitor/Tauri) in phase 2 without a rewrite.
export default defineConfig({
  base: './',
  server: { host: true },
});
