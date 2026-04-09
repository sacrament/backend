/**
 * Me Routes — authenticated user's own profile.
 * verifyClientToken + verifyToken are applied upstream in routes/index.js.
 */

const express      = require('express');
const router       = express.Router();
const meController = require('../controllers/me.controller');

// GET  /me
router.get('/', meController.getCurrentUserProfile);

// PATCH /me/setup — onboarding: name, dateOfBirth, gender, imageUrl, location, device
router.patch('/setup', meController.setupProfile);

// PUT  /me
router.put('/', meController.updateCurrentUserProfile);

// PUT  /me/picture
router.put('/picture', meController.updateCurrentUserPicture);

// PUT  /me/location
router.put('/location', meController.updateCurrentUserLocation);

// PUT  /me/presence  — heartbeat: updates lastSeen, keeps user visible in nearby
router.put('/presence', meController.updatePresence);

// PUT  /me/radar
router.put('/radar', meController.updateRadarStatus);

// PUT  /me/radar/invisible
router.put('/radar/invisible', meController.updateRadarInvisible);

// PUT  /me/notifications/preferences
router.put('/notifications/preferences', meController.updateNotificationPreferences);

// PUT  /me/visibility/preferences
router.put('/visibility/preferences', meController.updateVisibilityPreferences);

// PUT  /me/privacy
router.put('/privacy', meController.updateProfilePrivacy);

// DELETE /me
router.delete('/', meController.deleteCurrentUserAccount);

// ── Key Escrow ────────────────────────────────────────────────────────────────
// GET    /me/key-escrow
router.get('/key-escrow', meController.getKeyEscrow);
// PUT    /me/key-escrow
router.put('/key-escrow', meController.uploadKeyEscrow);

// ── Hidden Users (Radar) ──────────────────────────────────────────────────────
// GET    /me/hidden/users
router.get('/hidden/users', meController.getHiddenUsers);
// POST   /me/hidden/users
router.post('/hidden/users', meController.hideUser);
// DELETE /me/hidden/users/:userId
router.delete('/hidden/users/:userId', meController.unhideUser);

// ── Hidden Connections (Contacts List) ───────────────────────────────────────
// GET    /me/hidden/connections
router.get('/hidden/connections', meController.getHiddenConnections);
// POST   /me/hidden/connections
router.post('/hidden/connections', meController.hideConnection);
// DELETE /me/hidden/connections/:userId
router.delete('/hidden/connections/:userId', meController.unhideConnection);

module.exports = router;
