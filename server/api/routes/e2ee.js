const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/e2ee.controller');

// Device management
router.post('/device/register',            registerDevice);
router.get('/devices/:userId',             getDevices);
router.delete('/device/:deviceId',         removeDevice);

// Pre-key bundle (consumed on fetch)
router.get('/pre-key-bundle/:userId/:deviceId', getPreKeyBundle);

// One-time pre keys
router.post('/pre-keys',                   uploadPreKeys);
router.get('/pre-keys/count',              getPreKeyCount);

// Signed pre key rotation
router.put('/signed-pre-key',              updateSignedPreKey);

// Identity key
router.get('/identity-key/:userId',        getIdentityKey);

// Key backup (opaque encrypted blob)
router.post('/key-backup',                 storeKeyBackup);
router.get('/key-backup',                  getKeyBackup);
router.delete('/key-backup',               deleteKeyBackup);

module.exports = router;
