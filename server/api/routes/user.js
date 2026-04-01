/**
 * User Routes — public user data and social actions.
 * verifyClientToken is applied upstream in routes/index.js.
 */

const express             = require('express');
const router              = express.Router();
const { verifyToken }     = require('../../middleware/verify');
const favoritesController = require('../controllers/favorites.controller');
const {
    searchUsers,
    getUserById,
    verifyPhones,
    sendSMSToUsers,
    getBlockedUsers,
    blockUser,
    unblockUser,
    contentStorage,
    deleteContentById,
    getUnreadMessagesForUser,
    respondConnectionRequest,
    getConnectionRequests,
    checkConnectionRequest,
    getMyReports,
    fileReport,
} = require('../controllers/user.controller');

// GET  /users?name=<name>&page=0&size=20
router.get('/', verifyToken, searchUsers);

// GET  /users/blocked
router.get('/blocked', verifyToken, getBlockedUsers);

// POST /users/block
router.post('/block', verifyToken, blockUser);

// POST /users/unblock
router.post('/unblock', verifyToken, unblockUser);

// POST /users/send/sms
router.post('/send/sms', verifyToken, sendSMSToUsers);

// POST /users/verify/phones
router.post('/verify/phones', verifyToken, verifyPhones);

// GET  /users/content
router.get('/content', verifyToken, contentStorage);

// DELETE /users/content/single
router.delete('/content/single', verifyToken, deleteContentById);

// GET  /users/connectionRequests
router.get('/connectionRequests', verifyToken, getConnectionRequests);

// GET  /users/checkConnectionRequest?to=<userId>
router.get('/checkConnectionRequest', verifyToken, checkConnectionRequest);

// GET  /users/unreadMessages
router.get('/unreadMessages', verifyToken, getUnreadMessagesForUser);

// POST /users/respondConnectionRequest
router.post('/respondConnectionRequest', verifyToken, respondConnectionRequest);

// GET  /users/favorites
router.get('/favorites', verifyToken, favoritesController.getFavorites);

// POST /users/favorites
router.post('/favorites', verifyToken, favoritesController.addFavorite);

// DELETE /users/favorites/:userId
router.delete('/favorites/:userId', verifyToken, favoritesController.removeFavorite);

// ── Reports ───────────────────────────────────────────────────────────────────
// GET  /users/report
router.get('/report', verifyToken, getMyReports);
// POST /users/report
router.post('/report', verifyToken, fileReport);

// GET  /users/:id
router.get('/:id', verifyToken, getUserById);

module.exports = router;
