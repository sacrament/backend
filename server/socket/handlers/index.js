/**
 * Socket Event Handlers Hub
 * 
 * Central export for all socket event handlers.
 * Each handler class manages a domain of socket events.
 */

const ChatHandler = require('./chat.handler');
const CallsHandler = require('./calls.handler');
const UserHandler = require('./user.handler');

module.exports = {
  ChatHandler,
  CallsHandler,
  UserHandler,
};
