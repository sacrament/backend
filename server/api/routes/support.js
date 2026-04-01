/**
 * Support Routes
 * POST /api/support/contact — Submit a support / contact form
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

router.post('/contact', async (req, res) => {
  try {
    const { name, email, category, message, subcategory } = req.body;

    if (!name || !email || !category || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'name, email, category, and message are required'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: 'error', message: 'Invalid email format' });
    }

    const ticketId = uuidv4();

    // Log ticket (in production, persist to DB or send to support system)
    console.log('Support ticket created:', { ticketId, name, email, category, subcategory, message });

    return res.status(200).json({ ticketId });

  } catch (error) {
    console.error('Support contact error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to submit support request' });
  }
});

module.exports = router;
