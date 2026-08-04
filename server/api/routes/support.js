/**
 * Support Routes
 * POST /api/support/contact — Submit a support / contact form
 */

const express = require('express');
const router = express.Router();
const { contactUs } = require('../controllers/support.controller');

router.post('/contact', contactUs);

module.exports = router;
