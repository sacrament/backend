/**
 * App Version Admin Routes — /api/admin/app-version/*
 * `verifyAdminToken` is applied at mount time in routes/index.js. This is
 * gated by the standalone Admin collection's own token — never the mobile
 * app's user/client tokens.
 */

const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

const WRITABLE_FIELDS = ['minSupportedVersion', 'latestVersion', 'forceUpdate', 'updateMessage', 'appStoreId'];

// GET /api/admin/app-version — admin view of every platform's current config
router.get('/', async (req, res) => {
    try {
        const AppVersion = mongoose.model('AppVersion');
        const docs = await AppVersion.find({}).lean();
        res.json({ status: 'success', versions: docs });
    } catch (error) {
        logger.error('Error listing app version configs:', error);
        res.status(500).json({ status: 'error', message: 'Failed to list app version configs' });
    }
});

// PATCH /api/admin/app-version/:platform — upsert a platform's version requirements.
// Body: { minSupportedVersion?, latestVersion?, forceUpdate?, updateMessage?, appStoreId? }
router.patch('/:platform', async (req, res) => {
    const { platform } = req.params;
    if (!['iOS', 'Android'].includes(platform)) {
        return res.status(400).json({ status: 'error', message: 'platform must be iOS or Android' });
    }

    const update = {};
    for (const field of WRITABLE_FIELDS) {
        if (req.body[field] !== undefined) update[field] = req.body[field];
    }
    if (Object.keys(update).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No updatable fields provided' });
    }

    try {
        const AppVersion = mongoose.model('AppVersion');
        const doc = await AppVersion.findOneAndUpdate(
            { platform },
            { $set: update, $setOnInsert: { platform } },
            { new: true, upsert: true, runValidators: true }
        ).lean();
        logger.info(`AppVersion updated for platform=${platform} by adminId=${req.admin?._id}`);
        res.json({ status: 'success', version: doc });
    } catch (error) {
        logger.error('Error updating app version config:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update app version config' });
    }
});

module.exports = router;
