/**
 * Application Entry Point
 * 
 * Orchestrates server initialization, database connection, socket setup, and shutdown
 */

const http = require('http');
const config = require('./utils/config');
const bootstrap = require('./bootstrap');

// Load database models FIRST (before creating express app)
console.log('📦 Loading database models...');
bootstrap.database.loadModels();

// NOW create Express app (which may reference models)
const express = require('./index');

/**
 * Main application startup sequence
 */
async function startServer() {
  try {
    // 2. Connect to database
    console.log('🔌 Connecting to database...');
    const db = await bootstrap.database.connectDatabase();

    // 3. Create HTTP server
    const server = http.createServer(express);

    // 4. Initialize Socket.IO
    console.log('⚡ Initializing Socket.IO...');
    /** @type {import("socket.io").Server} */
    const io = await bootstrap.socket.initializeSocket(server);
    express.set('socketIO', io);

    // 5. Setup error handlers
    bootstrap.errors.setupErrorHandlers(server);

    // 6. Setup graceful shutdown
    bootstrap.shutdown.setupGracefulShutdown(server, io, db);

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