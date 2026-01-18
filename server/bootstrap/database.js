/**
 * Database Bootstrap Module
 * 
 * Handles all database model loading and initialization
 */

module.exports = {
  loadModels() {
    require('../models/user');
    require('../models/reaction');
    require('../models/media');
    require('../models/message');
    require('../models/chat');
    require('../models/calls/history');
    require('../models/user.blocked');
    require('../models/content.storage');
  },

  async connectDatabase() {
    const { MongoDatabase } = require('../config/database');
    const db = new MongoDatabase();
    
    try {
      await db.connect();
      console.log('✓ Database connected successfully');
      return db;
    } catch (error) {
      console.error(`✗ Database connection failed: ${error.message}`);
      throw error;
    }
  }
};
