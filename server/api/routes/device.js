const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../middleware/verify');
const {
    newDevice,
    updateDevice,
    getDevices,
    enableDevice,
    disableDevice,
    updateToken,
    updateState,
} = require('../controllers/device.controller');

// GET /api/devices
router.get('/', verifyToken, getDevices);

// POST /api/devices
router.post('/', newDevice);

// PUT /api/devices/:id
router.put('/:id', verifyToken, updateDevice);

// PUT /api/devices/:id/enable
router.put('/:id/enable', verifyToken, enableDevice);

// PUT /api/devices/:id/disable
router.put('/:id/disable', verifyToken, disableDevice);

// PUT /api/devices/:id/token
router.put('/:id/token', verifyToken, updateToken);

// PUT /api/devices/:id/state
router.put('/:id/state', verifyToken, updateState);

module.exports = router;
