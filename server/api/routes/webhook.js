
const express             = require('express');
const router              = express.Router();
const { twilioCallStatusCallbackDetails } = require('../controllers/call.controller');
// Twilio status callback (no token verification since Twilio won't have it)
// Twilio sends POST for status events but may GET to verify the URL is reachable.
router.get('/twilio/details', (req, res) => res.status(200).json({ status: 'ok' }));
router.post('/twilio/details', twilioCallStatusCallbackDetails);

module.exports = router;
