// Nearby Users Routes
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/verify');
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
router.get('/users', verifyToken, getNearbyUsers);

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
