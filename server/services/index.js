/**
 * Services Hub - Central export for all services
 * 
 * This module provides a single import point for all services in the application.
 * 
 * USAGE:
 * ======
 * // Instead of importing from scattered locations
 * const UserService = require('../services/user.service');
 * const SMSService = require('../services/sms/index');
 * const S3Service = require('../services/aws/s3.service');
 * 
 * // Import all from one place
 * const { UserService, ContactService, SMSService, S3Service } = require('../services');
 * 
 * ORGANIZATION:
 * =============
 * Domain Services (Business Logic)
 *   - ChatService: Chat operations
 *   - UserService: User management
 *   - ContactService: Contact management
 *   - CallService: Video calls
 * 
 * External Services (Third-party Integration)
 *   - S3Service: AWS S3 file storage
 *   - APIGatewayService: AWS API Gateway
 *   - SMSService: Twilio SMS
 *   - PushService: Push notifications
 */

// ============================================================================
// DOMAIN SERVICES (Business Logic)
// ============================================================================

const { ChatService } = require('./domain/chat');
const { UserService, ContactService } = require('./domain/user');
const { CallService } = require('./domain/call');

// ============================================================================
// EXTERNAL SERVICES (Third-party Integrations)
// ============================================================================

const { S3Service, APIGatewayService } = require('./external/aws');
const { SMSService } = require('./external/twilio');
const { PushService } = require('./external/push');

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Domain Services
  ChatService,
  UserService,
  ContactService,
  CallService,
  
  // External Services
  S3Service,
  APIGatewayService,
  SMSService,
  PushService,
};
