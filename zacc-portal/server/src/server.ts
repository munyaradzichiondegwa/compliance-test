import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { createApp } from './app';
import { initSchema, db } from './db';
import { initSocket } from './socket';
import { startScheduler } from './jobs/scheduler';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

initSchema(); // idempotent — safe to call even if seed.ts already ran

const app = createApp();
const httpServer = http.createServer(app);
initSocket(httpServer);
startScheduler();

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`\nZACC Institutional Compliance Portal API listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Health check: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown — important when running under a process manager
// (systemd, Docker, PM2) that sends SIGTERM on deploy/restart. Ensures
// in-flight requests finish and the SQLite connection closes cleanly
// (WAL checkpoint) rather than being killed mid-write.
function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down gracefully…`);
  httpServer.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    // eslint-disable-next-line no-console
    console.log('Shutdown complete.');
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs for longer than 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
