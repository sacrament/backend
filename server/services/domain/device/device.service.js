const mongoose = require('mongoose');
const DeviceModel = mongoose.model('Device');
const UserModel   = mongoose.model('User');

class DeviceService {
    /**
     * Register a new device.
     * Called before authentication — no user associated yet.
     * Call linkToUser() after the user authenticates.
     *
     * @param {Object} data - Device data
     * @returns {Promise<Object>}
     */
    async newDevice(data) {
        const { platform, os, version, appVersion, info, token, voipToken, state, uniqueId, model } = data;

        const device = new DeviceModel({
            platform,
            os: os || null,
            uniqueId: uniqueId || null,
            model: model || null,
            version: version || null,
            appVersion: appVersion || null,
            info: info || null,
            token: token || null,
            voipToken: voipToken || null,
            status: 'active',
            state: state || 'active'
        });

        return device.save();
    }

    /**
     * Link a device to a user after authentication.
     * Disables any previously active device for that user,
     * sets Device.user and User.device atomically.
     *
     * @param {string} deviceId
     * @param {string} userId
     * @returns {Promise<Object>} updated device
     */
    async linkToUser(deviceId, userId) {
        const existing = await DeviceModel.findById(deviceId).select('user').lean();
        if (!existing) throw new Error('Device not found');

        // If this device was previously owned by a different user, detach it from them
        // so their push notifications stop going to this physical phone
        if (existing.user && existing.user.toString() !== userId.toString()) {
            await UserModel.updateOne(
                { _id: existing.user },
                { $set: { device: null } }
            );
        }

        // Disable any other active devices the new user already has
        await DeviceModel.updateMany(
            { user: userId, status: 'active', _id: { $ne: deviceId } },
            { $set: { status: 'disabled', token: null, voipToken: null } }
        );

        const device = await DeviceModel.findByIdAndUpdate(
            deviceId,
            { $set: { user: userId } },
            { new: true }
        );

        await UserModel.updateOne(
            { _id: userId },
            { $set: { device: deviceId } }
        );

        return device;
    }

    /**
     * Update an existing device
     * @param {string} deviceId
     * @param {string} userId - Ensure ownership
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async updateDevice(deviceId, userId, data) {
        const allowed = ['version', 'appVersion', 'info', 'token', 'voipToken', 'status', 'uniqueId', 'model'];
        const updates = {};

        for (const key of allowed) {
            if (data[key] !== undefined) {
                updates[key] = data[key];
            }
        }

        updates.updatedOn = new Date();

        const device = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, user: userId },
            { $set: updates },
            { new: true }
        );

        if (!device) throw new Error('Device not found');

        // Ensure User.device always points to this device
        await UserModel.updateOne({ _id: userId }, { $set: { device: deviceId } });

        return device;
    }

    /**
     * Get all devices for a user
     * @param {string} userId
     * @returns {Promise<Array>}
     */
    async getDevicesForUser(userId) {
        return DeviceModel.find({ user: userId });
    }

    /**
     * Enable a device (set status = active)
     * @param {string} deviceId
     * @param {string} userId
     * @param {string} [token] - Optionally refresh push token
     * @returns {Promise<Object>}
     */
    async enableDevice(deviceId, userId, token) {
        const updates = { status: 'active', updatedOn: new Date() };
        if (token) updates.token = token;

        // Disable every other active device for this user first
        await DeviceModel.updateMany(
            { user: userId, status: 'active', _id: { $ne: deviceId } },
            { $set: { status: 'disabled', token: null, voipToken: null } }
        );

        const device = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, user: userId },
            { $set: updates },
            { new: true }
        );

        if (!device) throw new Error('Device not found');

        // Keep User.device pointing at the now-active device
        await UserModel.updateOne({ _id: userId }, { $set: { device: deviceId } });

        return device;
    }

    /**
     * Disable a device (set status = disabled, clear token)
     * @param {string} deviceId
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async disableDevice(deviceId, userId) {
        const device = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, user: userId },
            { $set: { status: 'disabled', token: null, voipToken: null, updatedOn: new Date() } },
            { new: true }
        );

        if (!device) throw new Error('Device not found');

        // If this was the user's current active device, clear the reference
        await UserModel.updateOne(
            { _id: userId, device: deviceId },
            { $set: { device: null } }
        );

        return device;
    }

    /**
     * Update push notification token for a device
     * @param {string} deviceId
     * @param {string} userId
     * @param {string} token
     * @returns {Promise<Object>}
     */
    async updateToken(deviceId, userId, token, voipToken) {
        const updates = { status: 'active', updatedOn: new Date() };
        if (token)     updates.token     = token;
        if (voipToken) updates.voipToken = voipToken;

        const device = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, user: userId },
            { $set: updates },
            { new: true }
        );

        if (!device) throw new Error('Device not found');

        // A token refresh means this device is the live one — keep User.device current
        await UserModel.updateOne({ _id: userId }, { $set: { device: deviceId } });

        return device;
    }

    /**
     * Update device state (active / background)
     * @param {string} deviceId
     * @param {string} userId
     * @param {string} state
     * @returns {Promise<Object>}
     */
    async updateState(deviceId, userId, state) {
        const device = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, user: userId },
            { $set: { state, updatedOn: new Date() } },
            { new: true }
        );

        if (!device) throw new Error('Device not found');
        return device;
    }
}

module.exports = DeviceService;
