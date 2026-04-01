const { getIO } = require('../bootstrap/io');

module.exports = class ChatService {
    /**
     * Check if a user is currently connected via socket
     * @param {string} user - User ID
     * @param {boolean} checkStatus - Whether to ping socket to verify status
     * @returns {Promise<boolean>}
     */
    async isUserConnected(user, checkStatus = true) {
        try {
            const io = getIO();
            const sockets = await io.in(user).fetchSockets();

            if (sockets.length === 0) {
                return false;
            }

            if (!checkStatus) {
                return true;
            }

            // Ping the first socket to confirm it's still alive
            const socket = sockets[0];
            return await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn(`User lost connection during status check: ${user}`);
                    resolve(false);
                }, 2500);

                socket.emit('check status', () => {
                    clearTimeout(timeout);
                    resolve(true);
                });
            });
        } catch (error) {
            console.error(`Error checking user connection status: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the number of active sockets for a user
     * @param {string} userId - User ID
     * @returns {Promise<number>} - Number of active sockets
     */
    async getActiveSocketCount(userId) {
        try {
            const io = getIO();
            const sockets = await io.in(userId).fetchSockets();
            return sockets.length;
        } catch (error) {
            console.error(`Error getting socket count for user ${userId}: ${error.message}`);
            return 0;
        }
    }

    /**
     * Emit message to a specific user room with verification
     * @param {Object} io - Socket.IO instance
     * @param {string} userId - Target user ID
     * @param {string} event - Event name
     * @param {Object} data - Event data
     * @returns {Promise<boolean>} - True if message was sent to at least one socket
     */
    async emitToUser(io, userId, event, data) {
        try {
            if (!userId || !event || !data) {
                throw new Error('Missing required parameters: userId, event, data');
            }

            const sockets = await io.in(userId).fetchSockets();

            if (sockets.length === 0) {
                console.warn(`No active sockets found for user: ${userId}`);
                return false;
            }

            // Emit to user room
            io.to(userId).emit(event, data);
            console.log(`Message emitted to ${sockets.length} socket(s) for user: ${userId}`);

            return true;
        } catch (error) {
            console.error(`Error emitting to user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Emit message to multiple users with verification
     * @param {Object} io - Socket.IO instance
     * @param {Array<string>} userIds - Array of user IDs
     * @param {string} event - Event name
     * @param {Object} data - Event data
     * @returns {Promise<Object>} - Object with successful and failed deliveries
     */
    async emitToUsers(io, userIds = [], event, data) {
        const results = {
            successful: [],
            failed: [],
            totalAttempted: userIds.length
        };

        for (const userId of userIds) {
            try {
                const success = await this.emitToUser(io, userId, event, data);
                if (success) {
                    results.successful.push(userId);
                } else {
                    results.failed.push(userId);
                }
            } catch (error) {
                console.error(`Error emitting to user ${userId}: ${error.message}`);
                results.failed.push(userId);
            }
        }

        return results;
    }
}
