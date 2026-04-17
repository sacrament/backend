/**
 * Moderation Routes — /api/moderation/*
 * verifyClientToken + verifyToken are applied upstream in routes/index.js.
 */

const express = require('express');
const router  = express.Router();
const { logModerationEvent, banUser } = require('../controllers/moderation.controller');

// POST /api/moderation/log
router.post('/log', logModerationEvent);

// POST /api/moderation/ban
router.post('/ban', banUser);

module.exports = router;
