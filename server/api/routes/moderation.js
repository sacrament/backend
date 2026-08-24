/**
 * Moderation Routes — /api/moderation/*
 * verifyClientToken + verifyToken are applied upstream in routes/index.js.
 */

const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../../middleware/verify');
const { logModerationEvent, banUser } = require('../controllers/moderation.controller');
const { getPendingReports, updateReportStatus, getReportById } = require('../controllers/report.controller');

// POST /api/moderation/log
// Client-reported safety telemetry. The event is attributed to the authenticated
// caller, never to a userId supplied in the body.
router.post('/log', logModerationEvent);

// POST /api/moderation/ban
// Admin only. Bans are a server-side decision; the client may report signals via
// /log but must never command a ban.
router.post('/ban', requireAdmin, banUser);

// ─── Report review (admin only) ───────────────────────────────────────────────

// GET /api/moderation/reports — pending/reviewing queue
router.get('/reports', requireAdmin, getPendingReports);

// GET /api/moderation/reports/:reportId
router.get('/reports/:reportId', requireAdmin, getReportById);

// PATCH /api/moderation/reports/:reportId — set status + actionTaken
router.patch('/reports/:reportId', requireAdmin, updateReportStatus);

module.exports = router;
