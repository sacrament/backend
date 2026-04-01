/**
 * Graceful Shutdown Module
 * 
 * Handles process signals and graceful server shutdown
 */

module.exports = {
  setupGracefulShutdown(server, io, db) {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`\n⚠ Received signal: ${signal}`);
        this._shutdown(server, io, db);
      });
    });

    process.on('uncaughtException', (error) => {
      console.error('✗ Uncaught Exception:', error);
      this._shutdown(server, io, db);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('✗ Unhandled Rejection at:', promise, 'reason:', reason);
      this._shutdown(server, io, db);
    });
  },

  _shutdown(server, io, db) {
    console.log('\n🛑 Starting graceful shutdown...');

    // Stop accepting new connections
    server.close(async (error) => {
      if (error) {
        console.error('✗ Error closing server:', error);
        process.exit(1);
      }

      try {
        // Stop job scheduler
        const { stopAgenda } = require('./agenda');
        await stopAgenda();

        // Close Socket.IO connections
        if (io) {
          io.close();
          console.log('✓ Socket.IO closed');
        }

        // Close database connection
        if (db) {
          await db.disconnect();
          console.log('✓ Database connection closed');
        }

        console.log('✓ Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('✗ Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('✗ Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  }
};
