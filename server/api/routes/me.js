/**
 * User Profile (Me) Routes
 * Handles authenticated user's own profile endpoints
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/verify');
const meController = require('../controllers/me.controller');

/**
 * GET /me
 * Get current user's profile
 */
router.get('/', verifyToken, meController.getCurrentUserProfile);

/**
 * PUT /me
 * Update current user's profile
 */
router.put('/', verifyToken, meController.updateCurrentUserProfile);

/**
 * PUT /me/picture
 * Update current user's picture
 */
router.put('/picture', verifyToken, meController.updateCurrentUserPicture);

/**
 * PUT /me/device-token
 * Update current user's device token
 */
router.put('/device-token', verifyToken, meController.updateCurrentUserDeviceToken);

/**
 * PUT /me/location
 * Update current user's location
 */
router.put('/location', verifyToken, meController.updateCurrentUserLocation);

/**
 * DELETE /me/deleteAccount
 * Delete current user's account
 */
router.delete('/deleteAccount', verifyToken, meController.deleteCurrentUserAccount);

module.exports = router;
