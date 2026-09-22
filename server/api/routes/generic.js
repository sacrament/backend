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

// GET /api/generic/appVersion — public; version requirements the client checks
// on launch and every foreground transition. Platform defaults to iOS since
// that's the only client today; ?platform=Android is accepted for later.
router.get('/appVersion', async (req, res) => {
    try {
        const platform = req.query.platform === 'Android' ? 'Android' : 'iOS';
        const AppVersion = mongoose.model('AppVersion');
        const doc = await AppVersion.findOne({ platform }, '-_id -__v -platform -createdAt -updatedAt').lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'No version config for this platform' });
        res.json(doc);
    } catch (error) {
        logger.error('Error fetching app version config:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch app version config' });
    }
});

// GET /api/generic/config — public; app-behavior config the client fetches on launch
// and caches locally (feature flags, tab/history-segment visibility). Platform
// defaults to iOS since that's the only client today. Falls back to the schema's
// own defaults (rather than 404) when no doc exists yet, since an unconfigured
// platform should behave like "nothing overridden," not an error.
router.get('/config', async (req, res) => {
    try {
        const platform = req.query.platform === 'Android' ? 'Android' : 'iOS';
        const RemoteConfig = mongoose.model('RemoteConfig');
        const doc = await RemoteConfig.findOne({ platform }, '-_id -__v -platform -createdAt -updatedAt').lean();

        const defaults = new RemoteConfig({ platform }).toObject();
        delete defaults._id;
        delete defaults.__v;
        delete defaults.platform;
        delete defaults.createdAt;
        delete defaults.updatedAt;

        // Merge rather than return `doc` as-is: a doc saved before a field was added
        // to the schema genuinely lacks that key in Mongo (defaults only apply on
        // document creation, not on read), so without this merge an older doc would
        // silently omit every field added since it was last written.
        res.json(doc ? { ...defaults, ...doc } : defaults);
    } catch (error) {
        logger.error('Error fetching remote config:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch remote config' });
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
