// npm run ui:dev → the API on 127.0.0.1:3001 plus Vite with hot reload on http://localhost:5173,
// which proxies /api to the API. One process; Ctrl-C stops both.
import path from 'node:path';
import { createServer } from 'vite';
import { ROOT } from '../src/config.mjs';
import { serverOptions, startServer } from './start.mjs';

const { noPhotos } = serverOptions();
const apiPort = 3001;
await startServer({ port: apiPort, noPhotos, staticDir: null });

const vite = await createServer({
  configFile: path.join(ROOT, 'web', 'vite.config.mjs'),
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
});
await vite.listen();
vite.printUrls();
