const mongoose = require('mongoose');
const { normalizeUserId } = require('../../../utils/user.utils');

class E2EEService {

    // ─── Device ───────────────────────────────────────────────────────────────

    async registerDevice(userId, { registrationId, identityKey, signedPreKey, oneTimePreKeys }) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        // One device per user — upsert to allow re-registration
        await E2EEDevice.findOneAndUpdate(
            { user: userId },
            {
                registrationId,
                identityKey,
                signedPreKey,
                oneTimePreKeys: oneTimePreKeys || [],
                lastSeen: new Date(),
            },
            { upsert: true, new: true }
        );
    }

    async getDevicesForUser(userId) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const devices = await E2EEDevice.find({ user: userId }).lean();

        return devices.map((d, index) => ({
            deviceId: index + 1,
            registrationId: d.registrationId,
            identityKey: d.identityKey,
            platform: d.platform,
            name: d.name,
            createdAt: d.createdAt,
            lastSeen: d.lastSeen,
        }));
    }

    async removeDevice(deviceId, userId) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');
        const result = await E2EEDevice.findOneAndDelete({ user: userId });
        if (!result) {
            const error = new Error('Device not found');
            error.status = 404;
            throw error;
        }
    }

    // ─── Pre-key bundle ───────────────────────────────────────────────────────

    async getPreKeyBundle(userId, deviceId) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const device = await E2EEDevice.findOne({ user: userId });
        if (!device) {
            const error = new Error('Device not found');
            error.status = 404;
            throw error;
        }

        // Touch lastSeen
        device.lastSeen = new Date();

        const bundle = {
            registrationId: device.registrationId,
            deviceId: deviceId,
            identityKey: device.identityKey,
            signedPreKeyId: device.signedPreKey.id,
            signedPreKey: device.signedPreKey.publicKey,
            signedPreKeySignature: device.signedPreKey.signature,
        };

        // Pop a one-time pre key if available
        if (device.oneTimePreKeys.length > 0) {
            const otk = device.oneTimePreKeys.shift();
            bundle.oneTimePreKeyId = otk.id;
            bundle.oneTimePreKey = otk.publicKey;
        }

        await device.save();

        return bundle;
    }

    // ─── One-time pre keys ────────────────────────────────────────────────────

    async addOneTimePreKeys(userId, preKeys) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const device = await E2EEDevice.findOne({ user: userId });
        if (!device) {
            const error = new Error('Device not registered');
            error.status = 404;
            throw error;
        }

        device.oneTimePreKeys.push(...preKeys);
        device.lastSeen = new Date();
        await device.save();
    }

    async getPreKeyCount(userId) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const device = await E2EEDevice.findOne({ user: userId }).select('oneTimePreKeys').lean();
        if (!device) {
            const error = new Error('Device not registered');
            error.status = 404;
            throw error;
        }

        return device.oneTimePreKeys.length;
    }

    // ─── Signed pre key ───────────────────────────────────────────────────────

    async updateSignedPreKey(userId, { id, publicKey, signature }) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const device = await E2EEDevice.findOne({ user: userId });
        if (!device) {
            const error = new Error('Device not registered');
            error.status = 404;
            throw error;
        }

        device.signedPreKey = { id, publicKey, signature };
        device.lastSeen = new Date();
        await device.save();
    }

    // ─── Identity key ─────────────────────────────────────────────────────────

    async getIdentityKey(userId) {
        userId = await normalizeUserId(userId);
        const E2EEDevice = mongoose.model('E2EEDevice');

        const device = await E2EEDevice.findOne({ user: userId }).select('identityKey').lean();
        if (!device) {
            const error = new Error('Device not registered');
            error.status = 404;
            throw error;
        }

        return device.identityKey;
    }

    // ─── Key backup ───────────────────────────────────────────────────────────

    async storeKeyBackup(userId, { salt, nonce, ciphertext, tag, version }) {
        userId = await normalizeUserId(userId);
        const E2EEKeyBackup = mongoose.model('E2EEKeyBackup');

        await E2EEKeyBackup.findOneAndUpdate(
            { user: userId },
            { salt, nonce, ciphertext, tag, version, createdAt: new Date() },
            { upsert: true, new: true }
        );
    }

    async getKeyBackup(userId) {
        userId = await normalizeUserId(userId);
        const E2EEKeyBackup = mongoose.model('E2EEKeyBackup');

        const backup = await E2EEKeyBackup.findOne({ user: userId }).lean();
        if (!backup) {
            const error = new Error('No key backup found');
            error.status = 404;
            throw error;
        }

        return {
            salt: backup.salt,
            nonce: backup.nonce,
            ciphertext: backup.ciphertext,
            tag: backup.tag,
            version: backup.version,
            createdAt: backup.createdAt,
        };
    }

    async deleteKeyBackup(userId) {
        userId = await normalizeUserId(userId);
        const E2EEKeyBackup = mongoose.model('E2EEKeyBackup');
        await E2EEKeyBackup.findOneAndDelete({ user: userId });
    }
}

module.exports = new E2EEService();
