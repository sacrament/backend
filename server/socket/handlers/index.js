/**
 * Socket Event Handlers Hub
 * 
 * Central export for all socket event handlers.
 * Each handler class manages a domain of socket events.
 */

const ChatHandler = require('./chat');
const CallsHandler = require('./calls');
const UserHandler = require('./user');

module.exports = {
  ChatHandler,
  CallsHandler,
  UserHandler,
};
