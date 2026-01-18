/**
 * Chat Service Module
 * 
 * Exports all chat-related services:
 * - ChatService: Core chat operations (CRUD, retrieval)
 * - Message operations: Database helpers for messages
 */

const ChatService = require('./chat.service');

module.exports = {
  ChatService,
  // DB helpers available if needed
  chatServiceDb: require('./chat.service.db'),
  messageServiceDb: require('./message.service.db'),
};
