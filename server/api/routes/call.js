const express = require('express');
const router = express.Router();

const { getAccessToken, bindDevice, unbindDevice, sendNotification, declineCall, callHistory, storeCallInfo, twilioCallStatusCallbackDetails, callDetails, deleteCallsByUser, getCallRequests } = require('../controllers/call.controller');
const { verifyToken } = require('../../middleware/verify');

router.get('/', (req, res)  => {
    res.status(200).json({status: 'success', message: 'Call Router'})
});

// get Twilio access token
router.get('/accessToken', verifyToken, getAccessToken);

//bind user device in twilio
router.post('/binding', verifyToken, bindDevice);

//unbind user device in twilio
router.delete('/binding', verifyToken, unbindDevice);

//send push notification to twilio user
router.post('/pushNotification', verifyToken, sendNotification);

//send push notification to twilio user
router.post('/decline', verifyToken, declineCall);

router.post('/storeInfo', verifyToken, storeCallInfo);
router.get('/history', verifyToken, callHistory);

router.post('/details', twilioCallStatusCallbackDetails);
router.get('/details/:roomId', callDetails);

router.post('/deleteByUser', verifyToken, deleteCallsByUser);

// get call requests for the authenticated user (optional ?response= filter)
router.get('/requests', verifyToken, getCallRequests);

module.exports = router;
