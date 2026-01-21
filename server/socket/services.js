/**
 * Socket Services Manager
 * 
 * Singleton services initialized once at server startup
 * Provides shared services to all socket handlers
 */

const ChatService = require('./chat.service');

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
        this.chatService = new ChatService(io);
        
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
     * @returns {*} Socket.IO instance
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

// Export singleton instance
module.exports = new SocketServicesManager();
