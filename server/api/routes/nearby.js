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
// GET /users-nearby?radius=5&unit=kilometer
router.get('/', verifyToken, getNearbyUsers);

// Get all nearby users history
// GET /users-nearby/history/users
router.get('/history/users', verifyToken, getNearbyUsersHistory);

// Get specific nearby user history
// GET /users-nearby/history/users/{userId}
router.get('/history/users/:userId', verifyToken, getNearbyUserSpecificHistory);

// Delete nearby user history
// DELETE /users-nearby/history/users/{userId}
router.delete('/history/users/:userId', verifyToken, deleteNearbyUserHistory);

module.exports = router;
