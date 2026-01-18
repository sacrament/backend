/**
 * Socket.IO Initialization Module
 * 
 * Configures Socket.IO with CORS, Redis adapter for production
 */

const config = require('../utils/config');

module.exports = {
  async initializeSocket(server) {
    const socketIO = require('socket.io');
    
    const io = socketIO(server, {
      pingInterval: config.HEARTBEAT_INTERVAL,
      pingTimeout: config.HEARTBEAT_TIMEOUT,
      upgradeTimeout: config.UPGRADE,
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      }
    });

    // Configure Redis adapter for distributed socket.io in production
    if (process.env.ENV_NAME === 'production') {
      try {
        await this._setupRedisAdapter(io);
      } catch (error) {
        console.warn('⚠ Redis adapter not available, running Socket.IO in-memory:', error.message);
      }
    }

    console.log('✓ Socket.IO initialized on port', config.PORT);
    return io;
  },

  async _setupRedisAdapter(io) {
    const { createClient } = require('redis');
    const ioRedis = require('socket.io-redis');

    const pubClient = createClient({ 
      host: config.REDIS_HOST, 
      port: config.REDIS_PORT 
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(ioRedis(pubClient, subClient));
    
    console.log('✓ Redis adapter configured for Socket.IO');
  }
};
