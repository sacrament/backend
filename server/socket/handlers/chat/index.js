/**
 * Chat Socket Event Handlers
 * 
 * Exports the Chat handler class that contains all chat-related socket events:
 * - new chat, edit chat, delete chat, leave chat
 * - message operations (new, delete, react)
 * - member management (add, remove)
 * - chat settings (favorite, mute, block)
 */

const ChatHandler = require('./chat.handler');

module.exports = ChatHandler;
