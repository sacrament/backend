const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const config = require('../../../utils/config');
const logger = require('../../../utils/logger');

const sesClient = new SESClient({
    region: config.AWS.REGION || 'us-east-1',
    credentials: {
        accessKeyId: config.AWS.ACCESS_KEY_ID,
        secretAccessKey: config.AWS.SECRET_ACCESS_KEY
    }
});

class MailService {
    /**
     * @param {{ to: string, subject: string, text: string }} params
     */
    async sendMail({ to, subject, text }) {
        const command = new SendEmailCommand({
            Source: config.SES.FROM,
            Destination: { ToAddresses: [to] },
            Message: {
                Subject: { Data: subject },
                Body: { Text: { Data: text } }
            }
        });

        await sesClient.send(command);

        return { sent: true };
    }
}

module.exports = MailService;
