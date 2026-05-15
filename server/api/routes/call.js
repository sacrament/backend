const express = require('express');
const router = express.Router();

const { getAccessToken, declineCall, callHistory, storeCallInfo, twilioCallStatusCallbackDetails, callDetails, deleteCallsByUser, getCallRequests, deleteCallById } = require('../controllers/call.controller');
const { verifyToken } = require('../../middleware/verify');

router.get('/', (req, res)  => {
    res.status(200).json({status: 'success', message: 'Call Router'})
});

// get Twilio access token
router.get('/accessToken', verifyToken, getAccessToken);

router.post('/decline', verifyToken, declineCall);

router.post('/storeInfo', verifyToken, storeCallInfo);
router.get('/history', verifyToken, callHistory);
router.get('/details/:roomId', callDetails);

router.post('/deleteByUser', verifyToken, deleteCallsByUser);

// get call requests for the authenticated user (optional ?response= filter)
router.get('/requests', verifyToken, getCallRequests);

// Delete a single call by its MongoDB _id
router.delete('/:id', verifyToken, deleteCallById);

module.exports = router;
