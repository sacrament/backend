/**
 * Socket Module - Central Socket.IO Configuration and Handlers
 * 
 * This module initializes Socket.IO with:
 * - Authentication middleware
 * - Event handler registration
 * - Connection/disconnection management
 * - Room management
 */
 
const mongoose = require('mongoose');
const socketAuth = require('../middleware/socket.auth');
const { UserService } = require('../services');
const MessageService = require('../services/domain/chat/message.service');

// Import event handlers
const { ChatHandler, CallsHandler, UserHandler } = require('./handlers');

// Import socket services manager
const socketServicesManager = require('./services');

// Global state - initialized once
/** */
let eventHandlers = null;
let handlersInitialized = false;
const messageService = new MessageService();

/**
 * Initialize Socket.IO with authentication and event handlers
 * @param { import("socket.io").Server } io - Socket.IO instance
 */
module.exports = async (io) => {
    console.log('Socket.IO started at: ' + new Date().toISOString());
    
    // Initialize socket services once
    socketServicesManager.initialize(io);
    
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
                handler.call(socket, data, ack);
            });
        });

        onConnected(socket);
        onDisconnected(socket);
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
 */
const onConnected = async (socket) => {
    const userId = socket.decoded_token?.userId;
    
    if (!userId) {
        console.error('No userId in decoded token');
        socket.disconnect(true);
        return;
    }

    try {
        const UserModel = mongoose.model('User');
        const user = await UserModel.findById(userId).select('deleted status').lean();

        if (!user || user.deleted || user.status === 'blocked' || user.status === 'inactive') {
            console.warn(`Session invalid for userId: ${userId} (deleted=${user?.deleted}, status=${user?.status})`);
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

        console.log(`User connected: ${userId} (${socket.user.type}) socket: ${socket.id}`);

        // Join user-specific room
        socket.join(userId);

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
        socket.emit('connected', { userId, sessionValid: true });
    } catch (error) {
        console.error('Error in onConnected:', error);
        socket.disconnect(true);
    }
};

/**
 * Socket disconnected - clean up user state
 * @param {import("socket.io").Socket} socket
 */
const onDisconnected = (socket) => {
    socket.on('disconnect', (reason) => {
        const userId = socket.user?.id;
        
        if (userId) {
            console.log(`User disconnected: ${userId} (socket: ${socket.id}) reason: ${reason}`);
            socket.broadcast.emit('user disconnected', { userId });
        } else {
            console.log(`Socket disconnected before authentication: ${socket.id} reason: ${reason}`);
        }
    });
};

