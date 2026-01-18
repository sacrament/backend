/**
 * User Routes
 * Handles user profile, search, blocks, and related endpoints
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/verify');

// Import controllers
const userController = require('../controllers/user.endpoint.controller');
const meController = require('../controllers/me.controller');
const blockController = require('../controllers/block.controller');

// ============= User Search & Details Endpoints =============

/**
 * GET /users
 * Search users by name
 */
router.get('/', verifyToken, userController.searchUsers);

/**
 * GET /users/{id}
 * Get user details by ID
 */
router.get('/:id', verifyToken, userController.getUserById);

/**
 * PUT /users/{id}
 * Update user profile
 */
router.put('/:id', verifyToken, userController.updateUserProfile);

/**
 * PUT /users/{id}/picture
 * Upload user picture
 */
router.put('/:id/picture', verifyToken, userController.uploadUserPicture);

/**
 * PUT /users/{id}/device-token
 * Update user device token
 */
router.put('/:id/device-token', verifyToken, userController.updateDeviceToken);

// ============= User Block Endpoints =============

/**
 * POST /users/blocks
 * Block a user
 */
router.post('/blocks', verifyToken, blockController.blockUser);

/**
 * GET /users/blocks
 * Get list of blocked users
 */
router.get('/blocks', verifyToken, blockController.getBlockedUsers);

/**
 * DELETE /users/blocks/{blockedUserId}
 * Unblock a user
 */
router.delete('/blocks/:blockedUserId', verifyToken, blockController.unblockUser);

/**
 * GET /users/blocks/{userId}
 * Check if user is blocked
 */
router.get('/blocks/:userId/status', verifyToken, blockController.isUserBlocked);

module.exports = router;
