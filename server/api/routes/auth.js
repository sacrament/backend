/**
 * Authentication Routes
 * Handles user authentication via Facebook, Apple, Phone OTP
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/verify');
const authController = require('../controllers/auth.controller');

/**
 * POST /auth/facebook
 * Facebook authentication
 */
router.post('/facebook', authController.facebookAuth);

/**
 * POST /auth/apple
 * Apple authentication
 */
router.post('/apple', authController.appleAuth);

/**
 * POST /auth/phone/otp/new/secured
 * Request phone OTP with signature verification
 */
router.post('/phone/otp/new/secured', authController.requestPhoneOtp);

/**
 * POST /auth/phone
 * Phone authentication with OTP
 */
router.post('/phone', authController.phoneAuth);

/**
 * GET /auth/token
 * Refresh authentication token
 */
router.get('/token', verifyToken, authController.refreshToken);

module.exports = router;
