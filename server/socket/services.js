/**
 * Socket Services Manager
 * 
 * Singleton services initialized once at server startup
 * Provides shared services to all socket handlers
 */

class SocketServicesManager {
    constructor() {
        this.io = null;
        this.chatService = null;
    }

    /**
     * Initialize all socket services
     * @param {*} io - Socket.IO instance
     */
    initialize(io) {
        if (this.io) {
            console.warn('⚠ SocketServicesManager already initialized');
            return;
        }

        this.io = io;
        const ChatService = require('./chat.service');
        this.chatService = new ChatService();
        
        console.log('✓ Socket services initialized');
    }

    /**
     * Get ChatService instance
     * @returns {ChatService}
     */
    getChatService() {
        if (!this.chatService) {
            throw new Error('SocketServicesManager not initialized. Call initialize(io) first.');
        }
        return this.chatService;
    }

    /**
     * Get Socket.IO instance
     * @returns {SocketIO} Socket.IO instance
     */
    getIO() {
        return this.io;
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        console.log('Shutting down Socket services...');
        this.chatService = null;
        this.io = null;
        console.log('✓ Socket services shutdown complete');
    }
}

// Export singleton instance and helper functions
const manager = new SocketServicesManager();

module.exports = {
    initialize: (io) => manager.initialize(io),
    getChatService: () => manager.getChatService(),
    getIO: () => manager.getIO(),
    shutdown: () => manager.shutdown()
};
