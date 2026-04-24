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
const { UserService } = require('../services');
const MessageService = require('../services/domain/chat/message.service');
const PendingSocketEventService = require('../services/domain/socket/pending.socket.event.service');

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

/**
 * Initialize Socket.IO with authentication and event handlers
 * @param { import("socket.io").Server } io - Socket.IO instance
 */
module.exports = async (io) => {
    console.log('Socket.IO started at: ' + new Date().toISOString());
    console.log('🔄 Server started - clearing session map for fresh start');
    
    // Initialize socket services once
    socketServicesManager.initialize(io);
    
    // Setup session cleanup timer
    setupSessionCleanup(io);
    
    // Register authentication middleware first
    io.use(socketAuth);
    
    // Global error handler for auth/connection errors
    io.use((socket, next) => {
        socket.on('error', (error) => {
            console.error(`[Socket Error] ${socket.id}: ${error}`);
        });
        next();
    });
    
    // Initialize and register event handlers ONCE at startup
    if (!handlersInitialized) {
        initializeHandlers(io);
        handlersInitialized = true;
    }

    // Connection handler
    io.on('connection', async (socket) => {
        // console.log(`📡 New socket connection attempt: ${socket.id}`);
        
        // Register all domain event handlers on this socket
        Object.entries(eventHandlers).forEach(([event, handler]) => {
            socket.on(event, function(data, ack) {
                // Log all socket events for debugging
                if (event !== 'check status') { // Skip frequent heartbeat events
                    console.log(`[Socket Event] ${event} - data keys: ${Object.keys(data || {}).join(', ') || '(empty)'}`);
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
        console.error(`[Socket Connect Error] ${error.message}`, error);
    });
};

/**
 * Initialize all event handlers once when server starts
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const initializeHandlers = (io) => {
    console.log('Initializing event handlers (one-time setup)');

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
    console.log(`✓ Event handlers initialized: ${eventCount} events registered`);
};

/**
 * Socket connected - setup user and join room
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io - Socket.IO instance
 */
const onConnected = async (socket, io) => {
    const userId = socket.decoded_token?.userId;
    
    if (!userId) {
        console.error(`[Auth Error] No userId in decoded token for socket: ${socket.id}`);
        socket.emit('error', 'Authentication failed: No user ID in token');
        socket.disconnect(true);
        return;
    }

    try {
        const UserModel = mongoose.model('User');
        const user = await UserModel.findById(userId).select('deleted status').lean();

        if (!user) {
            console.warn(`[Auth Error] User not found: ${userId}`);
            socket.emit('error', 'User not found');
            socket.emit('connected', { userId, sessionValid: false });
            socket.disconnect(true);
            return;
        }

        if (user.deleted) {
            console.warn(`[Auth Error] User account deleted: ${userId}`);
            socket.emit('error', 'User account has been deleted');
            socket.emit('connected', { userId, sessionValid: false });
            socket.disconnect(true);
            return;
        }

        if (user.status === 'blocked') {
            console.warn(`[Auth Error] User account blocked: ${userId}`);
            socket.emit('error', 'User account is blocked');
            socket.emit('connected', { userId, sessionValid: false });
            socket.disconnect(true);
            return;
        }

        if (user.status === 'inactive') {
            console.warn(`[Auth Error] User account inactive: ${userId}`);
            socket.emit('error', 'User account is inactive');
            socket.emit('connected', { userId, sessionValid: false });
            socket.disconnect(true);
            return;
        }

        // Attach user info to socket
        socket.user = {
            id: userId,
            socket: socket.id,
            type: socket.decoded_token?.type || 'mobile',
            token: socket.token
        };

        // Check if user already has an active socket connection
        if (userSessions.has(userId)) {
            const previousSession = userSessions.get(userId);
            
            // If this is the same socket (reconnection from recovery), allow it
            if (previousSession.socketId === socket.id) {
                console.log(`✓ User reconnected: ${userId} (${socket.user.type}) socket: ${socket.id}`);
                previousSession.lastSeen = Date.now();
            } else {
                // Different socket - disconnect the old one
                console.log(`⚡ Disconnecting previous socket for user ${userId}: ${previousSession.socketId}, new socket: ${socket.id}`);
                
                // Get the actual socket object and disconnect it
                const previousSocket = io.sockets.sockets.get(previousSession.socketId);
                if (previousSocket) {
                    previousSocket.emit('forcibly disconnected', { 
                        reason: 'New connection established from another device',
                        newSocketId: socket.id 
                    });
                    previousSocket.disconnect(true);
                    console.log(`✓ Previous socket disconnected for user: ${userId}`);
                }
                
                // Now register the new socket
                console.log(`➕ User connected: ${userId} (${socket.user.type}) socket: ${socket.id}`);
                userSessions.set(userId, {
                    userId,
                    socketId: socket.id,
                    type: socket.user.type,
                    connectedAt: Date.now(),
                    lastSeen: Date.now()
                });
            }
        } else {
            // First connection for this user
            console.log(`➕ User connected: ${userId} (${socket.user.type}) socket: ${socket.id}`);
            userSessions.set(userId, {
                userId,
                socketId: socket.id,
                type: socket.user.type,
                connectedAt: Date.now(),
                lastSeen: Date.now()
            });
        }

        // Join user-specific room
        socket.join(userId);

        try {
            const pendingEvents = await pendingSocketEventService.consumeForUser(userId);
            if (pendingEvents.length > 0) {
                for (const pendingEvent of pendingEvents) {
                    socket.emit(pendingEvent.event, pendingEvent.payload);
                }
                console.log(`Replayed ${pendingEvents.length} pending socket event(s) for user: ${userId}`);
            }
        } catch (error) {
            console.error(`Error replaying pending socket events for ${userId}: ${error.message}`);
        }

        // Mark all pending messages as delivered for this user (was offline, now back online)
        try {
            const markedCount = await messageService.markPendingMessagesAsDelivered(userId);
            if (markedCount > 0) {
                console.log(`Updated ${markedCount} messages as delivered for user: ${userId}`);
            }
        } catch (error) {
            console.error(`Error marking messages as delivered: ${error.message}`);
            // Don't fail the connection, just log the error
        }

        // Notify others
        socket.broadcast.emit('new user connected', {
            userId
        });

        // Notify this client
        socket.emit('connected', { 
            userId, 
            sessionValid: true,
            socketId: socket.id
        });
    } catch (error) {
        console.error(`[Socket Error] Error in onConnected for user ${userId}:`, error);
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
            console.log(`User disconnected: ${userId} (socket: ${socket.id}) reason: ${reason}`);
            
            // For temporary disconnections (network issues), keep session alive
            if (reason === 'transport error' || reason === 'ping timeout' || reason === 'transport close') {
                console.log(`⏱ Reconnection grace period started for user: ${userId} (${RECONNECTION_GRACE_PERIOD / 1000}s)`);

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
                            console.log(`Session cleaned up for user: ${userId} (grace period expired)`);
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
                console.log(`Session ended for user: ${userId}`);
                socket.broadcast.emit('user disconnected', { userId });
            }
        } else {
            console.log(`Socket disconnected before authentication: ${socket.id} reason: ${reason}`);
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
            console.log(`✓ User successfully reconnected: ${userId} (attempt: ${attemptNumber})`);
            
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
                console.log(`Session auto-cleanup: ${userId}`);
            }
        });

        if (cleanedCount > 0) {
            console.log(`✓ Cleaned up ${cleanedCount} expired sessions (active: ${userSessions.size})`);
        }
    }, 60000); // Run every minute
};

