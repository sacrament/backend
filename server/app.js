/**
 * Application Entry Point
 * 
 * Orchestrates server initialization, database connection, socket setup, and shutdown
 */

const http = require('http');
const config = require('./utils/config');
const startup = require('./startup');

// Load database models FIRST (before creating express app)
console.log('📦 Loading database models...');
startup.db.loadModels();

// NOW create Express app (which may reference models)
const express = require('./index');

/**
 * Main application startup sequence
 */
async function startServer() {
  try {
    // 2. Connect to database
    console.log('🔌 Connecting to database...');
    const db = await startup.db.connectDatabase();

    // 3a+3b. Ensure indexes and start job scheduler in parallel
    const mongoose = require('mongoose');
    console.log('⏱ Starting job scheduler and ensuring indexes...');
    await Promise.all([
      mongoose.model('Location').ensureIndexes(),
      startup.agenda.initAgenda(),
    ]);
    console.log('✓ Location indexes ensured');

    // 3. Create HTTP server
    const server = http.createServer(express);

    // 4. Initialize Socket.IO
    console.log('⚡ Initializing Socket.IO...');
    /** @type {import("socket.io").Server} */
    const io = await startup.socket.initializeSocket(server);

    // 5. Setup error handlers
    startup.errors.setupErrorHandlers(server);

    // 6. Setup graceful shutdown
    startup.shutdown.setupGracefulShutdown(server, io, db);

    // 7. Start listening
    console.log(`🚀 Starting server on port ${config.PORT}...`);
    server.listen(config.PORT, () => {
      // Initialize socket event handlers
      require('./socket')(io);
      console.log(`\n✅ Server ready at http://localhost:${config.PORT}`);
      console.log(`📡 Environment: ${process.env.ENV_NAME || 'development'}\n`);
    });

  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();