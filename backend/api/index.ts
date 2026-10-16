import { app } from '../src/app.js';

// Entry serverless resmi Vercel + Express: vercel.json me-rewrite semua request
// (/api/health, /api/public/site, /api/auth/login, ...) ke /api sehingga seluruh
// URL masuk ke app Express ini dan di-rute oleh router masing-masing.
// `server.ts` (socket.io + server.listen) sengaja tidak diimpor karena tidak
// jalan di lingkungan serverless.
export default app;
