const DeviceService = require('../../services/domain/device/device.service');
const deviceService = new DeviceService();
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

        const device = await deviceService.newDevice({ platform, os, version, appVersion, info, token, voipToken, state, uniqueId, model });

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
 * PUT /api/devices/:id/token
 * Update the push notification token for a device
 */
const updateToken = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.params;
        const { token, voipToken } = req.body;

        if (!token || token.trim() === '') {
            return res.status(400).json({ status: 'error', message: 'token is required' });
        }

        const device = await deviceService.updateToken(id, userId, token, voipToken);

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

module.exports = {
    newDevice,
    updateDevice,
    getDevices,
    enableDevice,
    disableDevice,
    updateToken,
    updateState,
};
