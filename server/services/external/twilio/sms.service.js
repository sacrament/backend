const twilio = require('twilio');
const config = require('../../../utils/config');

let client;

class SMSService {
    constructor() {
        client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN)
    }

    async send(from, phones) {
        return sendSMS(from, phones);
    }
}

const sendSMS = async (from, phones) => {
    const promises = phones.map(async phone => {
        try { 
            const result = await inviteToJoin(from, phone);

            return result;
        } catch (ex) {
            return ex;
        }
    });

    const result = await Promise.all(promises);
    console.log(`Result: ${JSON.stringify(result)}`);
    
    return result;
}

const inviteToJoin = async (from, phone) => {
    return client.messages.create({
        body: `${from.name} invited you to join Winky. Follow the link: https://www.winky.com`,
        from: 'Winky',
        to: phone
    })
}

module.exports = new SMSService();