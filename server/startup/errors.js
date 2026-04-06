/**
 * Server Error Handlers Module
 *
 * Centralized error handling for HTTP server events
 */

const config = require('../utils/config');

module.exports = {
  setupErrorHandlers(server) {
    server.on('error', (error) => this._handleServerError(error));
  },

  _handleServerError(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = `${config.PORT}`;
    const errorMessage = {
      'EACCES': `${bind} requires elevated privileges`,
      'EADDRINUSE': `${bind} is already in use`,
    };

    if (errorMessage[error.code]) {
      console.error(`✗ ${errorMessage[error.code]}`);
    } else {
      console.error(`✗ Server error: ${error.message}`);
    }

    process.exit(1);
  }
};
