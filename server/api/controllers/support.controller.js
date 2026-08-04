const SupportService = require('../../services/domain/support/support.service');
const supportService = new SupportService();
const logger = require('../../utils/logger');

/**
 * POST /api/support/contact
 * Body: { email, category, subcategory, message }
 */
const contactUs = async (req, res) => {
    try {
        const { email, category, subcategory, message } = req.body;

        if (!email || !category || !message) {
            return res.status(400).json({ status: 'error', message: 'email, category, and message are required' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ status: 'error', message: 'Invalid email format' });
        }

        const ticket = await supportService.submitContactUs({
            userId: req.decodedToken?.userId || null,
            email,
            category,
            subcategory,
            message,
        });

        return res.status(200).json({ status: 'success', ticketId: ticket._id.toString() });
    } catch (ex) {
        logger.error('Contact us error:', ex);
        return res.status(500).json({ status: 'error', message: 'Failed to submit support request' });
    }
};

module.exports = {
    contactUs,
};
