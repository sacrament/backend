/**
 * Remote Config Admin Routes — /api/admin/remote-config/*
 * `verifyAdminToken` is applied at mount time in routes/index.js. This is
 * gated by the standalone Admin collection's own token — never the mobile
 * app's user/client tokens.
 */

const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

const WRITABLE_FIELDS = [
    'version',
    'isMessageEncryptionEnabled',
    'isHarassmentMonitoringEnabled',
    'defaultVisibilityDurationSeconds',
    'visibleTabs',
    'visibleHistorySegments',
    'harassmentFirstMessageCooldownSeconds',
    'harassmentMaxWarningsBeforeBan',
    'harassmentClassifierThreshold',
    'callRingTimeoutSeconds',
    'isVideoCallsEnabled',
    'imageMaxDimension',
    'imageJPEGQuality',
    'videoReencodeThresholdBytes',
    'radarDistancePresets'
];

// GET /api/admin/remote-config — admin view of every platform's current config
router.get('/', async (req, res) => {
    try {
        const RemoteConfig = mongoose.model('RemoteConfig');
        const docs = await RemoteConfig.find({}).lean();
        res.json({ status: 'success', configs: docs });
    } catch (error) {
        logger.error('Error listing remote configs:', error);
        res.status(500).json({ status: 'error', message: 'Failed to list remote configs' });
    }
});

// PATCH /api/admin/remote-config/:platform — upsert a platform's config.
// Body: { version?, isMessageEncryptionEnabled?, isHarassmentMonitoringEnabled?,
//         defaultVisibilityDurationSeconds?, visibleTabs?, visibleHistorySegments? }
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
        const RemoteConfig = mongoose.model('RemoteConfig');
        const doc = await RemoteConfig.findOneAndUpdate(
            { platform },
            { $set: update, $setOnInsert: { platform } },
            { new: true, upsert: true, runValidators: true }
        ).lean();
        logger.info(`RemoteConfig updated for platform=${platform} by adminId=${req.admin?._id}`);
        res.json({ status: 'success', config: doc });
    } catch (error) {
        logger.error('Error updating remote config:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update remote config' });
    }
});

module.exports = router;
