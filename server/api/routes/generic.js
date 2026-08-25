const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

const { newClientToken } = require('../../middleware/verify');

// GET /api/generic/newToken
router.get('/newToken', async (req, res) => {
    try {
        const token = await newClientToken();
        logger.info('Generated new client token');
        res.json({ status: 'success', token });
    } catch (error) {
        logger.error('Error generating client token:', error);
        res.status(500).json({ status: 'error', message: 'Failed to generate client token' });
    }
});

// GET /api/generic/rules — public; returns Winky Community Rules from DB
router.get('/rules', async (req, res) => {
    try {
        const LegalContent = mongoose.model('LegalContent');
        const doc = await LegalContent.findOne({ type: 'winkyRules' }, '-_id -__v -createdAt -updatedAt -type').lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Rules not found' });
        res.json({
            lastUpdated: doc.lastUpdated,
            tagline: doc.tagline,
            cards: doc.cards
        });
    } catch (error) {
        logger.error('Error fetching Winky rules:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch rules' });
    }
});

// GET /api/generic/content — public; returns FAQ, Privacy Policy, Terms of Service from DB.
// Legal copy only changes when the seed script runs, so the built payload is cached in-process and
// rebuilt only when a document's updatedAt moves. Express generates the ETag from the response body
// and answers matching If-None-Match requests with a body-less 304 on its own.
let contentCache = null; // { fingerprint, payload }

function legalContentFingerprint(stamps) {
    return stamps
        .map(d => `${d.type}:${new Date(d.updatedAt).getTime()}`)
        .sort()
        .join('|');
}

router.get('/content', async (req, res) => {
    try {
        const LegalContent = mongoose.model('LegalContent');

        // Cheap query first: just the timestamps needed to tell whether anything changed.
        const stamps = await LegalContent.find({}, 'type updatedAt').lean();
        const fingerprint = legalContentFingerprint(stamps);

        res.set('Cache-Control', 'public, max-age=3600');

        if (contentCache && contentCache.fingerprint === fingerprint) {
            return res.json(contentCache.payload);
        }

        const docs = await LegalContent.find({}, '-_id -__v -createdAt -updatedAt').lean();

        const faqDoc      = docs.find(d => d.type === 'faq');
        const privacyDoc  = docs.find(d => d.type === 'privacyPolicy');
        const tosDoc      = docs.find(d => d.type === 'termsOfService');

        const lastUpdated = faqDoc?.lastUpdated || privacyDoc?.lastUpdated || tosDoc?.lastUpdated || null;

        const payload = {
            lastUpdated,
            faq: faqDoc
                ? faqDoc.categories.map(c => ({ category: c.category, items: c.items }))
                : [],
            privacyPolicy: privacyDoc
                ? { lastUpdated: privacyDoc.lastUpdated, sections: privacyDoc.sections }
                : { lastUpdated: null, sections: [] },
            termsOfService: tosDoc
                ? { lastUpdated: tosDoc.lastUpdated, sections: tosDoc.sections }
                : { lastUpdated: null, sections: [] }
        };

        contentCache = { fingerprint, payload };
        res.json(payload);
    } catch (error) {
        logger.error('Error fetching legal content:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch content' });
    }
});

module.exports = router;
