// npm run ui → serves web/dist and the read-only API on http://localhost:3000 (127.0.0.1 only).
import { serverOptions, startServer } from './start.mjs';

try {
  const { port, noPhotos } = serverOptions();
  await startServer({ port, noPhotos });
  console.log(`Tampere homes: http://localhost:${port}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
