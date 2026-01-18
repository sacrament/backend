/**
 * Socket Module - Central Socket.IO Configuration and Handlers
 * 
 * This module initializes Socket.IO with:
 * - Authentication middleware
 * - Event handler registration
 * - Connection/disconnection management
 * - Room management
 */

const config = require('../utils/config');
const socketAuth = require('../middleware/socket.auth');
const { UserService } = require('../services');
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');

// Import event handlers
const { ChatHandler, CallsHandler, UserHandler } = require('./handlers');

// Global state - initialized once
let eventHandlers = null;
let handlersInitialized = false;

module.exports = async (io) => {
    console.log('Socket.IO started at: ' + new Date().toISOString());
    
    // Register authentication middleware first
    io.use(socketAuth);
    
    // Initialize event handlers ONCE
    if (!handlersInitialized) {
        initializeHandlers(io);
        handlersInitialized = true;
    }

    // Connection handler
    io.on('connection', async (socket) => {
        onConnected(socket);
        onDisconnected(socket);
    });
};

/**
 * Initialize all event handlers once when server starts
 * @param {*} io
 */
const initializeHandlers = (io) => {
    console.log('Initializing event handlers (one-time setup)');
    
    const chat = new ChatHandler(io); 
    const calls = new CallsHandler(io);
    const user = new UserHandler(io);

    const chatHandler = chat.handler || {};
    const callsHandler = calls.handler || {};
    const usersHandler = user.handler || {};
    
    // Merge all handlers into a single object
    eventHandlers = { 
        ...chatHandler, 
        ...callsHandler, 
        ...usersHandler 
    };

    const eventCount = Object.keys(eventHandlers).length;
    console.log(`Total event handlers initialized: ${eventCount}`);
};

/**
 * Socket connected - register handlers for this socket only once
 * @param {*} socket
 */
const onConnected = async (socket) => {
    const userId = socket.decoded_token?.userId;
    const userType = socket.decoded_token?.type || 'mobile';
    
    if (!userId) {
        console.error('No userId in decoded token');
        socket.disconnect(true);
        return;
    }

    // Attach user info to socket
    socket.user = { 
        id: userId, 
        socket: socket.id, 
        type: userType, 
        token: socket.token 
    };
    
    socket.authenticated = true;
    console.log(`New user connected: ${userId} from device: ${userType} with socket id: ${socket.id}`);

    try {
        // Register event handlers for this socket - ONLY ONCE
        registerSocketHandlers(socket);

        // Get user from service
        const userService = new UserService(UserModel);
        const id = await userService.getUserIds([userId]);
        
        socket.user.originalId = userId;
        socket.user.id = id;

        // Join user-specific room
        joinUserRoom(socket);

        // Notify others
        socket.broadcast.emit('new user connected', {
            userId: id,
            originalId: socket.user.originalId
        });

        // Notify this client
        socket.emit('connected', {
            userId: id,
            originalId: socket.user.originalId
        });
    } catch (error) {
        console.error('Error in onConnected:', error);
        socket.disconnect(true);
    }
};

/**
 * Register socket event handlers - ensure handlers are added only once
 * @param {*} socket
 */
const registerSocketHandlers = (socket) => {
    if (socket._handlersRegistered) {
        console.warn(`Handlers already registered for socket: ${socket.id}`);
        return;
    }

    console.log(`Registering event handlers for socket: ${socket.id}`);
    
    // Register all event handlers for this socket
    for (const [event, handler] of Object.entries(eventHandlers)) {
        // Bind handler to socket context and add error handling
        const boundHandler = handler.bind(socket);
        
        socket.on(event, (data, ack) => {
            try {
                boundHandler(data, ack);
            } catch (error) {
                console.error(`Error in event handler '${event}':`, error);
                if (typeof ack === 'function') {
                    ack({ error: error.message });
                }
            }
        });
    }

    // Mark handlers as registered for this socket
    socket._handlersRegistered = true;
    console.log(`Event handlers registered for socket: ${socket.id}`);
};

/**
 * Socket disconnected - clean up user state
 * @param {*} socket
 */
const onDisconnected = (socket) => {
    socket.on('disconnect', (reason) => {
        if (socket.user?.id) {
            console.log(`User disconnected: ${socket.user.id} (socket: ${socket.id}) reason: ${reason}`);
            socket.broadcast.emit('user disconnected', { 
                userId: socket.user.id, 
                id: socket.user.originalId 
            });
        } else {
            console.log(`Socket disconnected before authentication: ${socket.id} reason: ${reason}`);
        }
        
        // Leave user room (socket will be destroyed by socket.io)
        leaveUserRoom(socket);
    });
};

/**
 * Join user-specific room
 * @param {*} socket
 */
const joinUserRoom = (socket) => {
    console.log(`Attempting to join room for user: ${socket.user.id}`);
    
    // Leave all previous rooms
    socket.leaveAll();
    
    // Join user-specific room
    socket.join(socket.user.id, (err) => {
        if (err) {
            console.error(`Error joining room ${socket.user.id}:`, err);
        } else { 
            console.log(`User ${socket.user.id} joined room: ${socket.user.id}`);
        }
    });
};

/**
 * Leave user room on disconnect
 * @param {*} socket
 */
const leaveUserRoom = (socket) => { 
    if (!socket.user?.id) {
        return;
    }

    socket.leave(socket.user.id, (err) => {
        if (err) {
            console.error(`Error leaving room ${socket.user.id}:`, err);
        } else {
            console.log(`User ${socket.user.id} left room: ${socket.user.id}`);
        }
    });
};
