/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/verify');
const authController = require('../controllers/auth.controller');

// POST /auth/phone/secured — Request OTP
router.post('/phone/secured', authController.requestPhoneOtp);

// POST /auth/phone/secured/otp — legacy alias
router.post('/phone/secured/otp', authController.phoneAuth);

// POST /auth/apple — Apple Sign-In
router.post('/apple', authController.appleAuth);

// POST /auth/google — Google Sign-In (Android)
router.post('/google', authController.googleAuth);

// GET /auth/token — Refresh access token (send refresh token in Authorization header)
router.get('/token', verifyToken, authController.refreshToken);

// POST /auth/logout
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
