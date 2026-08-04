const mongoose = require('mongoose');
const ContactUsModel = mongoose.model('ContactUs');
const MailService = require('../../external/mail/mail.service');
const config = require('../../../utils/config');
const logger = require('../../../utils/logger');

const mailService = new MailService();

class SupportService {
    /**
     * Persist a contact-us submission and notify the support inbox.
     *
     * @param {{ userId: string|null, email: string, category: string, subcategory: string|null, message: string }} data
     * @returns {Promise<Object>} the created ContactUs record
     */
    async submitContactUs({ userId, email, category, subcategory, message }) {
        const ticket = await ContactUsModel.create({
            user: userId || null,
            email,
            category,
            subcategory: subcategory || null,
            message,
        });

        try {
            const { sent } = await mailService.sendMail({
                to: config.SUPPORT_NOTIFICATION_EMAIL,
                subject: `[Contact Us] ${category}${subcategory ? ` / ${subcategory}` : ''}`,
                text: `From: ${email}\nCategory: ${category}\nSubcategory: ${subcategory || '-'}\n\n${message}`,
            });

            if (sent) {
                ticket.emailSent = true;
                await ticket.save();
            }
        } catch (ex) {
            logger.error('SupportService: failed to send contact-us notification email:', ex);
        }

        return ticket;
    }
}

module.exports = SupportService;
