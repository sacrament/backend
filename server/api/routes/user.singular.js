/**
 * User (singular) Routes — /api/user/*
 * Settings spec Section 2: mute, disappear, presence, reports, flags, account deletion alias.
 * verifyClientToken + verifyToken are applied upstream in routes/index.js.
 */

const express    = require('express');
const router     = express.Router();
const {
    muteUser,
    unmuteUser,
    getMutedUsers,
    disappearFromUser,
    undisappearFromUser,
    getDisappearedUsers,
    setPresence,
    getPresenceStatus,
    clearPresence,
    getMyReports,
    getUserFlags,
    deleteAccount,
} = require('../controllers/user.singular.controller');

// ── Mute ──────────────────────────────────────────────────────────────────────
// POST   /user/mute
router.post('/mute', muteUser);
// DELETE /user/mute/:userId
router.delete('/mute/:userId', unmuteUser);
// GET    /user/muted
router.get('/muted', getMutedUsers);

// ── Disappear ─────────────────────────────────────────────────────────────────
// POST   /user/disappear
router.post('/disappear', disappearFromUser);
// DELETE /user/disappear/:userId
router.delete('/disappear/:userId', undisappearFromUser);
// GET    /user/disappeared
router.get('/disappeared', getDisappearedUsers);

// ── Presence Beacon ───────────────────────────────────────────────────────────
// POST   /user/presence
router.post('/presence', setPresence);
// GET    /user/presence/status
router.get('/presence/status', getPresenceStatus);
// DELETE /user/presence
router.delete('/presence', clearPresence);

// ── Reports History ───────────────────────────────────────────────────────────
// GET    /user/reports
router.get('/reports', getMyReports);

// ── User Flags ────────────────────────────────────────────────────────────────
// GET    /user/flags/:userId
router.get('/flags/:userId', getUserFlags);

// ── Account Deletion Alias ────────────────────────────────────────────────────
// DELETE /user/me/deleteAccount
router.delete('/me/deleteAccount', deleteAccount);

module.exports = router;
