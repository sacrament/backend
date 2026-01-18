/**
 * User Service Module
 * 
 * Exports user and contact management services:
 * - UserService: User CRUD operations
 * - ContactService: Contact list management
 */

const UserService = require('./user.service');
const ContactService = require('./contact.service');

module.exports = {
  UserService,
  ContactService,
};
