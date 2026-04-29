const e2eeService = require('../../services/domain/e2ee/e2ee.service');
const logger = require('../../utils/logger');

// POST /api/e2ee/device/register
const registerDevice = async (req, res) => {
    const userId = req.decodedToken.userId;
    const { registrationId, identityKey, signedPreKey, oneTimePreKeys } = req.body;

    try {
        await e2eeService.registerDevice(userId, { registrationId, identityKey, signedPreKey, oneTimePreKeys });
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE register device error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// GET /api/e2ee/devices/:userId
const getDevices = async (req, res) => {
    const { userId } = req.params;

    try {
        const devices = await e2eeService.getDevicesForUser(userId);
        res.status(200).json({ devices });
    } catch (err) {
        logger.error('E2EE get devices error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// DELETE /api/e2ee/device/:deviceId
const removeDevice = async (req, res) => {
    const userId = req.decodedToken.userId;
    const { deviceId } = req.params;

    try {
        await e2eeService.removeDevice(deviceId, userId);
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE remove device error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// GET /api/e2ee/pre-key-bundle/:userId/:deviceId
const getPreKeyBundle = async (req, res) => {
    const { userId, deviceId } = req.params;

    try {
        const bundle = await e2eeService.getPreKeyBundle(userId, deviceId);
        res.status(200).json({ bundle });
    } catch (err) {
        if (err.status === 404 && err.message === 'E2EE device not registered for user') {
            logger.info(`E2EE pre-key bundle unavailable (user not registered): userId=${userId}, deviceId=${deviceId}`);
        } else if (err.status === 404) {
            logger.warn(`E2EE pre-key bundle not found: userId=${userId}, deviceId=${deviceId}, message=${err.message}`);
        } else {
            logger.error('E2EE get pre-key bundle error:', err);
        }
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// POST /api/e2ee/pre-keys
const uploadPreKeys = async (req, res) => {
    const userId = req.decodedToken.userId;
    const { preKeys } = req.body;

    try {
        await e2eeService.addOneTimePreKeys(userId, preKeys);
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE upload pre-keys error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// PUT /api/e2ee/signed-pre-key
const updateSignedPreKey = async (req, res) => {
    const userId = req.decodedToken.userId;
    const { id, publicKey, signature } = req.body;

    try {
        await e2eeService.updateSignedPreKey(userId, { id, publicKey, signature });
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE update signed pre-key error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// GET /api/e2ee/pre-keys/count
const getPreKeyCount = async (req, res) => {
    const userId = req.decodedToken.userId;

    try {
        const count = await e2eeService.getPreKeyCount(userId);
        res.status(200).json({ count });
    } catch (err) {
        logger.error('E2EE get pre-key count error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// GET /api/e2ee/identity-key/:userId
const getIdentityKey = async (req, res) => {
    const { userId } = req.params;

    try {
        const identityKey = await e2eeService.getIdentityKey(userId);
        res.status(200).json({ identityKey });
    } catch (err) {
        logger.error('E2EE get identity key error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// POST /api/e2ee/key-backup
const storeKeyBackup = async (req, res) => {
    const userId = req.decodedToken.userId;
    const { salt, nonce, ciphertext, tag, version } = req.body;

    try {
        await e2eeService.storeKeyBackup(userId, { salt, nonce, ciphertext, tag, version });
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE store key backup error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// GET /api/e2ee/key-backup
const getKeyBackup = async (req, res) => {
    const userId = req.decodedToken.userId;

    try {
        const backup = await e2eeService.getKeyBackup(userId);
        res.status(200).json({ backup });
    } catch (err) {
        logger.error('E2EE get key backup error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

// DELETE /api/e2ee/key-backup
const deleteKeyBackup = async (req, res) => {
    const userId = req.decodedToken.userId;

    try {
        await e2eeService.deleteKeyBackup(userId);
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('E2EE delete key backup error:', err);
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

module.exports = {
    registerDevice,
    getDevices,
    removeDevice,
    getPreKeyBundle,
    uploadPreKeys,
    updateSignedPreKey,
    getPreKeyCount,
    getIdentityKey,
    storeKeyBackup,
    getKeyBackup,
    deleteKeyBackup,
};
