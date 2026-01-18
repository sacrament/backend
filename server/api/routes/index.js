const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.json( { title: 'Winky' });
  });

// Import route modules
const authRoutes = require('./auth');
const userRoutes = require('./user.endpoints');
const meRoutes = require('./me');
const nearbyRoutes = require('./nearby');
const chatRoutes = require('./chat');
const callRoutes = require('./call');

// Register routes
router.use('/api/auth', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/me', meRoutes);
router.use('/api/users-nearby', nearbyRoutes);
router.use('/api/chat', chatRoutes);
router.use('/api/calls', callRoutes);

// Legacy routes (backward compatibility)
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/me', meRoutes);
router.use('/users-nearby', nearbyRoutes);
router.use('/chat', chatRoutes);
router.use('/calls', callRoutes);

module.exports = router;