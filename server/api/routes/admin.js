/**
 * Admin Auth Routes — /api/admin/*
 * Public — this IS the login route, so nothing can gate it yet.
 */

const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { verifyPassword } = require('../../utils/password');
const { newAdminToken } = require('../../middleware/verify');

// POST /api/admin/login — email + password against the standalone Admin
// collection (never the User collection). Returns a 12h admin JWT.
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'email and password are required' });
    }

    try {
        const Admin = mongoose.model('Admin');
        const admin = await Admin.findOne({ email: String(email).toLowerCase().trim(), active: true });
        if (!admin || !verifyPassword(password, admin.passwordHash)) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
        const token = newAdminToken(admin._id.toString());
        res.json({ status: 'success', token });
    } catch (error) {
        logger.error('Error during admin login:', error);
        res.status(500).json({ status: 'error', message: 'Login failed' });
    }
});

module.exports = router;
