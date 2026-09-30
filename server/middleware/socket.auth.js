/**
 * Modern Socket.IO Authentication Middleware
 * Replaces deprecated socketio-jwt package
 * 
 * Usage:
 * io.use(authenticateSocket);
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../utils/config');
const { isSessionReplaced } = require('../utils/session');

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

    // Get deviceId from handshake
    const deviceId = 
      socket.handshake.auth.deviceId || 
      socket.handshake.query.deviceId || 
      null;

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

      // A token from a replaced or ended session (signed in on another phone,
      // or logged out) mustn't reconnect: that phone would keep receiving the
      // account's calls and messages. Same rule as verifyToken.
      mongoose.model('User').findById(decoded.userId).select('sessionStartedAt').lean()
        .then((user) => {
          if (user && isSessionReplaced(decoded, user.sessionStartedAt)) {
            console.warn(`[Socket Auth] Session replaced for user ${decoded.userId} (socket: ${socket.id}, deviceId: ${deviceId || 'none'})`);
            return next(new Error('Authentication error: Session replaced'));
          }

          // Attach decoded token and deviceId to socket
          socket.decoded_token = decoded;
          socket.userId = decoded.userId;
          socket.token = token;
          socket.deviceId = deviceId;

          console.log(`[Socket Auth] ✓ Authentication successful for user: ${decoded.userId} (socket: ${socket.id}, deviceId: ${deviceId || 'none'})`);
          next();
        })
        .catch((lookupErr) => {
          console.error(`[Socket Auth] User lookup failed for socket ${socket.id}:`, lookupErr.message);
          next(new Error('Authentication error: Lookup failed'));
        });
    });
  } catch (error) {
    console.error(`[Socket Auth] Middleware error for socket ${socket.id}:`, error.message);
    next(new Error('Authentication error: ' + error.message));
  }
}

module.exports = authenticateSocket;
