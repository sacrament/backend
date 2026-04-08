/**
 * Socket.IO Initialization Module
 *
 * Configures Socket.IO with CORS, Redis adapter for production
 */

const config = require('../utils/config');
const { initIO } = require('./io');
const socketIO = require('socket.io');

module.exports = {
  async initializeSocket(server) {

    // Transport order: polling first so clients behind VPNs or HTTP proxies that
    // block WebSocket can still connect, then upgrade to WebSocket when available.
    //
    // Sticky sessions: mobile clients don't persist cookies, so use source IP
    // affinity on the load balancer (ALB target group → stickiness → "source IP")
    // rather than cookie-based stickiness. All polling + upgrade requests from a
    // device share the same source IP and will be routed to the same instance.
    const io = socketIO(server, {
      transports: ['polling', 'websocket'],
      allowUpgrades: true,
      pingInterval: config.HEARTBEAT_INTERVAL,
      pingTimeout: config.HEARTBEAT_TIMEOUT,
      upgradeTimeout: config.UPGRADE,
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
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

    initIO(io);
    console.log('✓ Socket.IO initialized on port', config.PORT);
    return io;
  },

  async _setupRedisAdapter(io) {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');

    const pubClient = createClient({
      socket: { host: config.REDIS_HOST, port: config.REDIS_PORT }
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));

    console.log('✓ Redis adapter configured for Socket.IO');
  }
};
