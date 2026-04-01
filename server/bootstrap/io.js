/**
 * IO Singleton
 *
 * Holds the Socket.IO server instance. Initialize once at startup,
 * then import `getIO` anywhere (controllers, services, etc.) to emit events.
 *
 * Usage:
 *   const { getIO } = require('../io');
 *   getIO().to(roomId).emit('event', data);
 */

let _io = null;

/**
 * Store the Socket.IO instance. Called once during server startup.
 * @param {import('socket.io').Server} io
 */
const initIO = (io) => {
    if (_io) {
        console.warn('⚠ IO already initialized');
        return;
    }
    _io = io;
    console.log('✓ IO singleton initialized');
};

/**
 * Retrieve the Socket.IO instance.
 * @returns {import('socket.io').Server}
 */
const getIO = () => {
    if (!_io) {
        throw new Error('IO not initialized. Call initIO(io) before using getIO().');
    }
    return _io;
};

module.exports = { initIO, getIO };
