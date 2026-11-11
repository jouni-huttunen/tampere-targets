import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
// The app version comes from package.json, so the boot screen can never fall behind a release.
const { version } = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

export default defineConfig({
  root: here,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true },
  // The dev server (host, port, /api proxy) is configured in server/dev.mjs ("npm run ui:dev").
});
