/**
 * Database Bootstrap Module
 * 
 * Handles all database model loading and initialization
 * Provides graceful shutdown and reconnection management
 */

const MongoDatabase = require('../config/database');

const databaseInstance = new MongoDatabase();;

module.exports = {
  loadModels() {
    require('../models/user');
    require('../models/device');
    require('../models/location');
    require('../models/reaction');
    require('../models/media');
    require('../models/message');
    require('../models/chat');
    require('../models/calls/history');
    require('../models/user.blocked');
    require('../models/content.storage');
    require('../models/nearby.users.log');
    require('../models/otp.session');
    require('../models/report');
    require('../models/legal.content');
  },

  async connectDatabase() {
    
    try {
      await databaseInstance.connect();
      console.log('✓ Database connected successfully');
      return databaseInstance;
    } catch (error) {
      console.error(`✗ Database connection failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * Graceful shutdown handler
   * Closes database connections cleanly
   */
  async shutdownDatabase() {
    if (!databaseInstance) {
      console.log('No active database connection to shutdown');
      return;
    }

    try {
      await databaseInstance.disconnect();
      console.log('✓ Database shutdown completed successfully');
    } catch (error) {
      console.error(`✗ Error during database shutdown: ${error.message}`);
      throw error;
    }
  },

  /**
   * Register graceful shutdown handlers for common signals
   */
  registerShutdownHandlers() {
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n${signal} received. Starting graceful shutdown...`);
        
        try {
          await this.shutdownDatabase();
          console.log('✓ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('✗ Error during graceful shutdown:', error.message);
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('✗ Uncaught Exception:', error);
      
      try {
        await this.shutdownDatabase();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError.message);
      }
      
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('✗ Unhandled Rejection at:', promise, 'reason:', reason);
      
      try {
        await this.shutdownDatabase();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError.message);
      }
      
      process.exit(1);
    });
  }
};
