/**
 * Socket Module - Central Socket.IO Configuration and Handlers
 * 
 * This module initializes Socket.IO with:
 * - Authentication middleware
 * - Event handler registration
 * - Connection/disconnection management
 * - Room management
 * - Automatic reconnection handling
 */
 
const mongoose = require('mongoose');
const socketAuth = require('../middleware/socket.auth');
const MessageService = require('../services/domain/chat/message.service');
const logger = require('../utils/logger');
const PendingSocketEventService = require('../services/domain/socket/pending.socket.event.service');
const UserSession = require('../models/user.session');

// Import event handlers
const { ChatHandler, CallsHandler, UserHandler } = require('./handlers');

// Import socket services manager
const socketServicesManager = require('./services');

// Global state - initialized once
/** Map to store user session state for reconnection recovery */
const userSessions = new Map();
let eventHandlers = null;
let handlersInitialized = false;
const messageService = new MessageService();
const pendingSocketEventService = new PendingSocketEventService();

// Reconnection grace period: keep session data for 30 seconds
const RECONNECTION_GRACE_PERIOD = 30 * 1000;

// Reconnect rate limiter: track connect timestamps per user
const connectTimestamps = new Map();
const RECONNECT_WINDOW_MS = 60 * 1000; // 1 minute
const RECONNECT_MAX_IN_WINDOW = 8;      // allow up to 8 connects/min before throttling
const RECONNECT_BACKOFF_MS = 30 * 1000; // tell client to wait 30s

/**
 * Initialize Socket.IO with authentication and event handlers
 * @param { import("socket.io").Server } io - Socket.IO instance
 */
module.exports = async (io) => {
    logger.info('Socket.IO started at: ' + new Date().toISOString());
    logger.info('Server started - clearing session map for fresh start');
    
    // Initialize socket services once
    socketServicesManager.initialize(io);
    
    // Setup session cleanup timer
    setupSessionCleanup(io);
    
    // Register authentication middleware first
    io.use(socketAuth);
    
    // Initialize and register event handlers ONCE at startup
    if (!handlersInitialized) {
        initializeHandlers(io);
        handlersInitialized = true;
    }

    // Connection handler
    io.on('connection', async (socket) => {
        // Register all domain event handlers on this socket
        Object.entries(eventHandlers).forEach(([event, handler]) => {
            socket.on(event, function(data, ack) {
                // Log all socket events for debugging
                if (event !== 'check status') { // Skip frequent heartbeat events
                    logger.info(`[Socket Event] ${event} - data keys: ${Object.keys(data || {}).join(', ') || '(empty)'}`);
                }
                handler.call(socket, data, ack);
            });
        });

        onConnected(socket, io);
        onDisconnected(socket, io);
        onReconnect(socket, io);
    });

    // Connection error handler
    io.on('connect_error', (error) => {
        logger.error(`[Socket Connect Error] ${error.message}`, { stack: error.stack });
    });
};

/**
 * Initialize all event handlers once when server starts
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const initializeHandlers = (io) => {
    logger.info('Initializing event handlers (one-time setup)');

    const chat = new ChatHandler();
    const calls = new CallsHandler();
    const user = new UserHandler();

    // Merge all handlers into a single object
    eventHandlers = {
        ...chat.handler,
        ...calls.handler,
        ...user.handler
    };

    const eventCount = Object.keys(eventHandlers).length;
    logger.info(`Event handlers initialized: ${eventCount} events registered`);
};

/**
 * Socket connected - setup user and join room
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const onConnected = async (socket, io) => {
    const userId = socket.decoded_token?.userId;

    if (!userId) {
        logger.error(`[Auth Error] No userId in decoded token for socket: ${socket.id}`);
        socket.emit('error', 'Authentication failed: No user ID in token');
        socket.disconnect(true);
        return;
    }

    // Rate-limit reconnect storms: reject if user connects too frequently
    const now = Date.now();
    const timestamps = (connectTimestamps.get(userId) || []).filter(t => now - t < RECONNECT_WINDOW_MS);
    timestamps.push(now);
    connectTimestamps.set(userId, timestamps);

    if (timestamps.length > RECONNECT_MAX_IN_WINDOW) {
        logger.warn(`[RateLimit] User ${userId} exceeded reconnect limit (${timestamps.length} in ${RECONNECT_WINDOW_MS / 1000}s) — throttling`);
        socket.emit('reconnect_throttled', { retryAfter: RECONNECT_BACKOFF_MS });
        socket.disconnect(true);
        return;
    }

    try {
        const UserModel = mongoose.model('User');
        const user = await UserModel.findById(userId).select('deleted status').lean();

        if (!user) {
            logger.warn(`[Auth Error] User not found: ${userId}`);
            socket.emit('logout', { reason: 'user_not_found' });
            socket.emit('error', 'User not found');
            socket.disconnect(true);
            return;
        }

        if (user.deleted) {
            logger.warn(`[Auth Error] User account deleted: ${userId}`);
            socket.emit('error', 'User account has been deleted');
            socket.disconnect(true);
            return;
        }

        if (user.status === 'blocked') {
            logger.warn(`[Auth Error] User account blocked: ${userId}`);
            socket.emit('error', 'User account is blocked');
            socket.disconnect(true);
            return;
        }

        if (user.status === 'inactive') {
            logger.warn(`[Auth Error] User account inactive: ${userId}`);
            socket.emit('error', 'User account is inactive');
            socket.disconnect(true);
            return;
        }

        // Attach user info to socket
        socket.user = {
            id: userId,
            socket: socket.id,
            type: socket.decoded_token?.type || 'mobile',
            token: socket.token,
            deviceId: socket.deviceId || null
        };

        // Check if user already has an active socket connection
        const previousSession = userSessions.get(userId);
        const isSameDeviceReconnect = previousSession
            && socket.deviceId
            && previousSession.deviceId === socket.deviceId;

        if (previousSession && !isSameDeviceReconnect) {
            // Different device - disconnect the old one
            logger.info(`Disconnecting previous socket for user ${userId}: ${previousSession.socketId}, new socket: ${socket.id}`);

            if (previousSession.gracePeriodTimer) clearTimeout(previousSession.gracePeriodTimer);

            // Get the actual socket object and disconnect it
            const previousSocket = io.sockets.sockets.get(previousSession.socketId);
            if (previousSocket) {
                previousSocket.emit('forcibly disconnected', {
                    reason: 'New connection established from another device',
                    newSocketId: socket.id
                });
                previousSocket.disconnect(true);
                logger.info(`Previous socket disconnected for user: ${userId}`);
            }
        }

        if (isSameDeviceReconnect) {
            // Same device reconnecting after a network blip/backgrounding - resume, don't recreate
            logger.info(`User reconnected: ${userId} (${socket.user.type}) socket: ${socket.id} (was: ${previousSession.socketId})`);
            if (previousSession.gracePeriodTimer) clearTimeout(previousSession.gracePeriodTimer);
            socket._sessionId = previousSession.dbSessionId || null;
            socket._sessionConnectedAt = previousSession.connectedAt ? new Date(previousSession.connectedAt) : new Date();
        } else {
            // First connection for this user, or a different device taking over
            logger.info(`User connected: ${userId} (${socket.user.type}) socket: ${socket.id}, deviceId: ${socket.deviceId || 'none'}`);
        }

        userSessions.set(userId, {
            userId,
            socketId: socket.id,
            type: socket.user.type,
            deviceId: socket.deviceId || null,
            dbSessionId: isSameDeviceReconnect ? previousSession.dbSessionId : null,
            connectedAt: isSameDeviceReconnect ? previousSession.connectedAt : Date.now(),
            lastSeen: Date.now()
        });

        // Join user-specific room
        socket.join(userId);

        // Ack the client immediately — nothing below should delay this
        socket.emit('connected', { userId, sessionValid: true, socketId: socket.id });
        socket.broadcast.emit('new user connected', { userId });

        // All post-connect work is fire-and-forget so it never blocks the handshake
        setImmediate(async () => {
            // Touch lastSeen so "Active now" presence reflects the connect
            UserModel.updateOne({ _id: userId }, { $set: { lastSeen: new Date() } })
                .catch(err => logger.error(`Failed to update lastSeen on connect for ${userId}: ${err.message}`));

            // Record/resume session in DB
            if (socket._sessionId) {
                // Same-device reconnect - update the existing open session, don't create a new row
                UserSession.findByIdAndUpdate(socket._sessionId, {
                    socketId: socket.id,
                    transport: socket.conn?.transport?.name || null,
                    disconnectedAt: null,
                    disconnectReason: null,
                    durationMs: null,
                }).catch(err => logger.error(`Failed to resume user session: ${err.message}`));
            } else {
                socket._sessionConnectedAt = new Date();
                UserSession.create({
                    userId,
                    socketId: socket.id,
                    ip: socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
                        || socket.handshake.address,
                    userAgent: socket.handshake.headers['user-agent'] || null,
                    deviceId: socket.deviceId || null,
                    transport: socket.conn?.transport?.name || null,
                    connectedAt: socket._sessionConnectedAt,
                }).then(session => {
                    socket._sessionId = session._id;
                    const entry = userSessions.get(userId);
                    if (entry) entry.dbSessionId = session._id;
                }).catch(err => logger.error(`Failed to record user session: ${err.message}`));
            }

            // Replay pending events and mark messages delivered in parallel
            await Promise.allSettled([
                pendingSocketEventService.consumeForUser(userId).then(pendingEvents => {
                    for (const pendingEvent of pendingEvents) {
                        socket.emit(pendingEvent.event, pendingEvent.payload);
                    }
                    if (pendingEvents.length > 0) {
                        logger.info(`Replayed ${pendingEvents.length} pending socket event(s) for user: ${userId}`);
                    }
                }),
                messageService.markPendingMessagesAsDelivered(userId).then(markedCount => {
                    if (markedCount > 0) {
                        logger.info(`Updated ${markedCount} messages as delivered for user: ${userId}`);
                    }
                }),
            ]).then(results => {
                results.forEach(r => {
                    if (r.status === 'rejected') logger.error(`Post-connect task failed for ${userId}: ${r.reason?.message}`);
                });
            });
        });
    } catch (error) {
        logger.error(`[Socket Error] Error in onConnected for user ${userId}: ${error.message}`);
        socket.emit('error', `Connection error: ${error.message}`);
        socket.disconnect(true);
    }
};

/**
 * Socket disconnected - handle user offline with reconnection grace period
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const onDisconnected = (socket, io) => {
    socket.on('disconnect', (reason) => {
        const userId = socket.user?.id;
        
        if (userId) {
            logger.info(`User disconnected: ${userId} (socket: ${socket.id}) reason: ${reason}`);

            // Touch lastSeen so "Active now" presence reflects the disconnect
            mongoose.model('User').updateOne({ _id: userId }, { $set: { lastSeen: new Date() } })
                .catch(err => logger.error(`Failed to update lastSeen on disconnect for ${userId}: ${err.message}`));

            // For temporary disconnections (network issues), keep the session open and give the
            // client a chance to resume it - don't close the DB row until the grace period expires
            if (reason === 'transport error' || reason === 'ping timeout' || reason === 'transport close') {
                logger.info(`Reconnection grace period started for user: ${userId} (${RECONNECTION_GRACE_PERIOD / 1000}s)`);

                // Cancel any existing grace-period timer for this user before creating a new one
                if (userSessions.has(userId)) {
                    const existing = userSessions.get(userId);
                    if (existing.gracePeriodTimer) {
                        clearTimeout(existing.gracePeriodTimer);
                    }
                }

                // Set a timer to clean up session if not reconnected within grace period
                const timer = setTimeout(() => {
                    if (userSessions.has(userId)) {
                        const session = userSessions.get(userId);
                        // Only clean up if socket hasn't been renewed
                        if (session.socketId === socket.id) {
                            userSessions.delete(userId);
                            logger.info(`Session cleaned up for user: ${userId} (grace period expired)`);

                            if (socket._sessionId) {
                                const now = new Date();
                                UserSession.findByIdAndUpdate(socket._sessionId, {
                                    disconnectedAt: now,
                                    disconnectReason: reason,
                                    durationMs: now - (socket._sessionConnectedAt || now),
                                }).catch(err => logger.error(`Failed to close user session: ${err.message}`));
                            }

                            // Notify others that user is truly offline
                            socket.broadcast.emit('user disconnected', { userId });
                        }
                    }
                }, RECONNECTION_GRACE_PERIOD);

                // Store timer reference so it can be cancelled on the next disconnect
                if (userSessions.has(userId)) {
                    userSessions.get(userId).gracePeriodTimer = timer;
                }
            } else {
                // For intentional disconnects, cancel any pending timer and clean up immediately
                if (userSessions.has(userId)) {
                    const session = userSessions.get(userId);
                    if (session.gracePeriodTimer) clearTimeout(session.gracePeriodTimer);
                }
                userSessions.delete(userId);
                logger.info(`Session ended for user: ${userId}`);

                if (socket._sessionId) {
                    const now = new Date();
                    UserSession.findByIdAndUpdate(socket._sessionId, {
                        disconnectedAt: now,
                        disconnectReason: reason,
                        durationMs: now - (socket._sessionConnectedAt || now),
                    }).catch(err => logger.error(`Failed to close user session: ${err.message}`));
                }

                socket.broadcast.emit('user disconnected', { userId });
            }
        } else {
            logger.info(`Socket disconnected before authentication: ${socket.id} reason: ${reason}`);
        }
    });
};

/**
 * Handle user reconnection - restore session state
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const onReconnect = (socket, io) => {
    socket.on('reconnect', (attemptNumber) => {
        const userId = socket.user?.id;
        
        if (userId && userSessions.has(userId)) {
            logger.info(`User successfully reconnected: ${userId} (attempt: ${attemptNumber})`);
            
            // Stale reconnection request - socket.io has already rejoin rooms in onConnected
            // Just update last seen time
            const session = userSessions.get(userId);
            session.lastSeen = Date.now();
            
            // Notify client and others of successful reconnection
            socket.emit('reconnected', { userId, attemptNumber });
            socket.broadcast.emit('user reconnected', { userId });
        }
    });
};

/**
 * Cleanup expired sessions periodically
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const setupSessionCleanup = (io) => {
    // Cleanup expired sessions every minute
    setInterval(() => {
        const now = Date.now();
        let cleanedCount = 0;

        userSessions.forEach((session, userId) => {
            if (now - session.lastSeen > RECONNECTION_GRACE_PERIOD) {
                userSessions.delete(userId);
                cleanedCount++;
                logger.info(`Session auto-cleanup: ${userId}`);
            }
        });

        // Clean up stale rate-limit entries
        connectTimestamps.forEach((timestamps, userId) => {
            const fresh = timestamps.filter(t => now - t < RECONNECT_WINDOW_MS);
            if (fresh.length === 0) {
                connectTimestamps.delete(userId);
            } else {
                connectTimestamps.set(userId, fresh);
            }
        });

        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} expired sessions (active: ${userSessions.size})`);
        }
    }, 60000); // Run every minute
};

