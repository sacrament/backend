/**
 * Configuration Module Hub
 * 
 * Central export for all application configuration:
 * - Database connections (MongoDB, MySQL)
 * - Socket.IO setup
 */

const { MongoDatabase, MySQLDatabase } = require('./database');

module.exports = {
  database: {
    mongo: MongoDatabase,
    mysql: MySQLDatabase,
  },
  // Socket.IO config available at: server/config/integrations/socket.js
  // Imported directly: require('../socket')
};
