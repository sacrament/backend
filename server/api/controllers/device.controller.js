const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DeviceService = require('../../services/domain/device/device.service');
const deviceService = new DeviceService();
const UserService = require('../../services/domain/user/user.service');
const userService = new UserService();
const config = require('../../utils/config');
const logger = require('../../utils/logger');

/**
 * POST /api/devices
 * Register a new device for the authenticated user
 */
const newDevice = async (req, res) => {
    try {
        const { platform, os, version, appVersion, info, token, voipToken, state, uniqueId, model } = req.body;

        if (!platform || !['iOS', 'Android'].includes(platform)) {
            return res.status(400).json({ status: 'error', message: 'platform must be "iOS" or "Android"' });
        }

        // Auth-optional: the app sends its user token when it has one, and the device
        // is then linked to that user. An invalid or missing token registers it unlinked.
        let userId = null;
        const header = req.headers.authorization;
        if (header) {
            try {
                userId = jwt.verify(header.startsWith('Bearer ') ? header.slice(7) : header, config.APP_SECRET)?.userId || null;
            } catch { userId = null; }
        }

        const device = await deviceService.newDevice({ platform, os, version, appVersion, info, token, voipToken, state, uniqueId, model }, userId);

        return res.status(201).json({ status: 'success', device });
    } catch (ex) {
        logger.error('New device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * PUT /api/devices/:id
 * Update an existing device
 */
const updateDevice = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;

        if (req.body.platform && !['iOS', 'Android'].includes(req.body.platform)) {
            return res.status(400).json({ status: 'error', message: 'platform must be "iOS" or "Android"' });
        }

        if (req.body.status && !['active', 'disabled'].includes(req.body.status)) {
            return res.status(400).json({ status: 'error', message: 'status must be "active" or "disabled"' });
        }

        if (req.body.state && !['active', 'background'].includes(req.body.state)) {
            return res.status(400).json({ status: 'error', message: 'state must be "active" or "background"' });
        }

        const device = await deviceService.updateDevice(id, userId, req.body);

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Update device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * GET /api/devices
 * Get all devices for the authenticated user
 */
const getDevices = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const devices = await deviceService.getDevicesForUser(userId);

        return res.status(200).json({ status: 'success', devices });
    } catch (ex) {
        logger.error('Get devices error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * PUT /api/devices/:id/enable
 * Enable a device and optionally refresh its push token
 */
const enableDevice = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;
        const { token } = req.body;

        const device = await deviceService.enableDevice(id, userId, token);

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Enable device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * PUT /api/devices/:id/disable
 * Disable a device and clear its push token
 */
const disableDevice = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;

        const device = await deviceService.disableDevice(id, userId);

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Disable device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * DELETE /api/devices/:id
 * Soft-delete a device (mark deleted and clear tokens)
 */
const deleteDevice = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;

        const device = await deviceService.deleteDevice(id, userId);

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Delete device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * PUT /api/devices/:id/token
 * Update the push notification token for a device
 */
const updateToken = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;
        const {
            token,
            voipToken,
            platform,
            uniqueId,
            os,
            version,
            appVersion,
            info,
            model,
            state
        } = req.body;

        if (!token || token.trim() === '') {
            return res.status(400).json({ status: 'error', message: 'token is required' });
        }

        if (platform && !['iOS', 'Android'].includes(platform)) {
            return res.status(400).json({ status: 'error', message: 'platform must be "iOS" or "Android"' });
        }

        const device = await deviceService.updateToken(id, userId, token, voipToken, {
            platform,
            uniqueId,
            os,
            version,
            appVersion,
            info,
            model,
            state
        });

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Update token error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * PUT /api/devices/:id/state
 * Update the device state (active / background)
 */
const updateState = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;
        const { state } = req.body;

        if (!state || !['active', 'background'].includes(state)) {
            return res.status(400).json({ status: 'error', message: 'state must be "active" or "background"' });
        }

        const device = await deviceService.updateState(id, userId, state);

        return res.status(200).json({ status: 'success', device });
    } catch (ex) {
        if (ex.message === 'Device not found') {
            return res.status(404).json({ status: 'error', message: ex.message });
        }
        logger.error('Update device state error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

/**
 * POST /api/devices/:id/logout
 * Body: { accessToken }
 *
 * Called by the app on every logout, including forced ones (session revoked,
 * refresh failed) where it no longer holds a valid token — so this route sits
 * behind the client token only, and ownership is proven with the user's last
 * access token verified WITHOUT its expiry. Disables only this device, so a
 * stale phone can't cut off the user's current one. If it was the user's current
 * device, also clears their refresh token and takes them off the radar, same as
 * POST /auth/logout.
 */
const logoutDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { accessToken } = req.body || {};
        if (!mongoose.isValidObjectId(id) || typeof accessToken !== 'string' || !accessToken) {
            return res.status(400).json({ status: 'error', message: 'device id and accessToken are required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(accessToken, config.APP_SECRET, { ignoreExpiration: true });
        } catch {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }
        const userId = decoded?.userId;
        if (!userId) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { disabled, wasCurrentDevice } = await deviceService.logoutDevice(id, userId);
        if (wasCurrentDevice) {
            await Promise.all([
                userService.clearRefreshToken(userId),
                userService.startNewSession(userId),
                userService.removeFromRadar(userId),
            ]);
        }

        return res.status(200).json({ status: 'success', disabled });
    } catch (ex) {
        logger.error('Logout device error:', ex);
        return res.status(500).json({ status: 'error', message: ex.message });
    }
};

module.exports = {
    logoutDevice,
    newDevice,
    updateDevice,
    getDevices,
    enableDevice,
    disableDevice,
    deleteDevice,
    updateToken,
    updateState,
};
