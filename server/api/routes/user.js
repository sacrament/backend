const express = require('express');
const router = express.Router();  

const { verifyToken } = require('../../middleware/verify');

const { newUser, 
        updateDeviceToken, 
        verifyUsers, 
        sendSMSToUsers, 
        enableDevice, 
        disableDevice, 
        refreshAuthToken, 
        getBlockedUsers, 
        blockUser, 
        unblockUser, 
        contentStorage, 
        deleteContentById, 
        getUnreadMessagesForUser, me, updateRadar, deleteAccount } = require('../controllers/user.controller');

router.get('/', (req, res, next)  => {
    res.status(200).json({status: 'success', message: 'Chat Router'})
})

/// New user signup
router.post('/new', newUser);

router.put('/device/updateToken', verifyToken, updateDeviceToken);

router.post('/verify/phones', verifyToken, verifyUsers);

router.post('/send/sms', verifyToken, sendSMSToUsers);

// -- Device
router.put('/device/enable', verifyToken, enableDevice);

router.put('/device/disable', verifyToken, disableDevice);

router.post('/token', refreshAuthToken);

router.get('/blocked', verifyToken, getBlockedUsers);

router.post('/block', verifyToken, blockUser);

router.post('/unblock', verifyToken, unblockUser);

router.get('/content', verifyToken, contentStorage);

router.delete('/content/single', verifyToken, deleteContentById);

router.get('/unreadMessages', verifyToken, getUnreadMessagesForUser);

router.get('/me', verifyToken, me);

router.post('/me/updateRadar', verifyToken, updateRadar);

router.delete('/me/deleteAccount', verifyToken, deleteAccount);

module.exports = router;