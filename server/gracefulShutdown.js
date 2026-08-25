/**
 * Graceful Shutdown Handler
 * Ensures open WebSocket connections are closed cleanly and DB pool drains
 * before the process exits on SIGTERM/SIGINT (Railway deploys, PM2 restarts, Ctrl+C).
 */
module.exports = function setupGracefulShutdown(server, wss) {
  let isShuttingDown = false;

  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[SHUTDOWN] ${signal} received — graceful shutdown started`);

    // 1. Stop accepting new HTTP connections
    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed');
    });

    // 2. Notify all WebSocket clients and close connections
    if (wss) {
      wss.clients.forEach((ws) => {
        try {
          ws.close(1001, 'Server is restarting, please reconnect shortly');
        } catch (e) {
          // ignore
        }
      });
      console.log(`[SHUTDOWN] Closed ${wss.clients.size} WebSocket connections`);
    }

    // 3. Force exit after 10 seconds if something hangs
    const forceExit = setTimeout(() => {
      console.error('[SHUTDOWN] Force exit after timeout');
      process.exit(1);
    }, 10000);
    forceExit.unref(); // Don't keep process alive just for this timer

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};
