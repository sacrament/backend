/**
 * Modern Socket.IO Authentication Middleware
 * Replaces deprecated socketio-jwt package
 * 
 * Usage:
 * io.use(authenticateSocket);
 */

const jwt = require('jsonwebtoken');
const config = require('../utils/config');

/**
 * Authenticate socket connections using JWT tokens
 * 
 * @param {Socket} socket - Socket.IO socket object
 * @param {Function} next - Next middleware function
 */
function authenticateSocket(socket, next) {
  try {
    // Get token from various sources
    let token = 
      socket.handshake.auth.token || 
      socket.handshake.query.token || 
      socket.handshake.headers.authorization;

    // Remove Bearer prefix if present
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    if (!token) {
      console.warn(`[Socket Auth] No token provided for socket: ${socket.id}`);
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    jwt.verify(token, config.APP_SECRET, (err, decoded) => {
      if (err) {
        console.error(`[Socket Auth] Token verification failed for socket ${socket.id}:`, err.message);
        
        if (err.name === 'TokenExpiredError') {
          return next(new Error('Authentication error: Token expired'));
        }
        
        if (err.name === 'JsonWebTokenError') {
          return next(new Error('Authentication error: Invalid token format'));
        }
        
        return next(new Error('Authentication error: Invalid token'));
      }

      // Attach decoded token to socket
      socket.decoded_token = decoded;
      socket.userId = decoded.userId;
      socket.token = token;

      console.log(`[Socket Auth] ✓ Authentication successful for user: ${decoded.userId} (socket: ${socket.id})`);
      next();
    });
  } catch (error) {
    console.error(`[Socket Auth] Middleware error for socket ${socket.id}:`, error.message);
    next(new Error('Authentication error: ' + error.message));
  }
}

module.exports = authenticateSocket;
