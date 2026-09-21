const twilio = require('twilio');

const createTwilioClient = ({ ACCOUNTSID, API_KEY, API_KEY_SECRET }) => {
    if (!ACCOUNTSID || !API_KEY || !API_KEY_SECRET) {
        throw new Error('Twilio is not configured: TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_KEY_SECRET are required');
    }
    return twilio(API_KEY, API_KEY_SECRET, { accountSid: ACCOUNTSID });
};

module.exports = createTwilioClient;
