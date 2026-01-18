/**
 * User Socket Event Handlers
 * 
 * Exports the User handler class that contains all user-related socket events:
 * - contact management (store, remove, edit)
 * - connection requests (send, respond, cancel, check)
 * - friendship operations (undo)
 */

const UserHandler = require('./user.handler');

module.exports = UserHandler;
