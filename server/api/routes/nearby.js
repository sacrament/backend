// Nearby Users Routes
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../../middleware/verify');

// Per-user limiter for the polling endpoint (~1 req/min expected → 30/15 min gives 2× headroom)
const nearbyUsersLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.decodedToken?.userId?.toString() || req.ip,
    message: { status: 'error', code: 429, message: 'Too many nearby requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const {
  getNearbyUsers,
  getNearbyUsersHistory,
  getNearbyUserSpecificHistory,
  deleteNearbyUserHistory
} = require('../controllers/nearby.controller');

/**
 * Nearby Users Endpoints
 * Base path: /users-nearby
 */
 

// Get nearby users within radius
// GET /nearby?radius=5&unit=kilometer
router.get('/users', nearbyUsersLimiter, getNearbyUsers);

// Get all nearby users history
// GET /nearby/history/users
router.get('/users/history', verifyToken, getNearbyUsersHistory);

// Get specific nearby user history
// GET /nearby/history/users/{userId}
router.get('/users/history/:userId', verifyToken, getNearbyUserSpecificHistory);

// Delete nearby user history
// DELETE /nearby/history/users/{userId}
router.delete('/users/history/:userId', verifyToken, deleteNearbyUserHistory);

module.exports = router;
