import { app } from '../src/app.js';

// Entry serverless: file api/[...path].ts menangkap seluruh request /api/* dengan
// URL asli, jadi route Express tetap cocok tanpa rewrite. `server.ts` (socket.io +
// server.listen) sengaja tidak diimpor karena tidak jalan di serverless.
export default app;
