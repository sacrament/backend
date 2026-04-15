const MongoDatabase = require('./connection');

const databaseInstance = new MongoDatabase();

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
    require('../models/calls/request');
    require('../models/user.blocked');
    require('../models/content.storage');
    require('../models/nearby.users.log');
    require('../models/otp.session');
    require('../models/report');
    require('../models/legal.content');
    require('../models/e2ee.device');
    require('../models/e2ee.key.backup');
    require('../models/user.muted');
    require('../models/user.disappeared');
    require('../models/key.escrow');
    require('../models/key.backup');
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
};
