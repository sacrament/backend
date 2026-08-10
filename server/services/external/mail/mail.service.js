const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const config = require('../../../utils/config');
const logger = require('../../../utils/logger');

// In production the ECS task role provides SES permissions and credentials are
// resolved automatically by the SDK's default provider chain. Static keys are
// only present locally (.env.local) — passing an explicit `credentials` object
// with undefined values would stop the SDK from falling back to the task role,
// so only set it when both values are actually configured.
const sesClient = new SESClient({
    region: config.AWS.REGION || 'us-east-1',
    ...(config.AWS.ACCESS_KEY_ID && config.AWS.SECRET_ACCESS_KEY
        ? {
              credentials: {
                  accessKeyId: config.AWS.ACCESS_KEY_ID,
                  secretAccessKey: config.AWS.SECRET_ACCESS_KEY
              }
          }
        : {})
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
