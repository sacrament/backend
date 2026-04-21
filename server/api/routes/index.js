const express       = require('express');
const crypto        = require('crypto');
const rateLimit     = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { verifyToken, verifyClientToken } = require('../../middleware/verify');

// Route modules
const authRoutes         = require('./auth');
const userRoutes         = require('./user');
const userSingularRoutes = require('./user.singular');
const meRoutes           = require('./me');
const nearbyRoutes       = require('./nearby');
const chatRoutes         = require('./chat');
const callRoutes         = require('./call');
const deviceRoutes       = require('./device');
const supportRoutes      = require('./support');
const genericRoutes      = require('./generic');
const e2eeRoutes         = require('./e2ee');
const moderationRoutes   = require('./moderation');
const webhookRoutes      = require('./webhook');

// ─── Rate limiters ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    skipSuccessfulRequests: true,
    message: { status: 'error', code: 429, message: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    keyGenerator: (req) => {
        const phone = req.body?.phoneNumber || '';
        if (!phone) return ipKeyGenerator(req);
        // Hash the phone number to use as rate limit key
        return crypto.createHash('sha256').update(phone).digest('hex');
    },
    message: { status: 'error', code: 429, message: 'Too many OTP requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/', (req, res) => res.json({ title: 'Winky' }));
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

router.use('/api/webhook', webhookRoutes); // For Twilio status callbacks that don't have client token

// Rate limiters
router.post('/api/auth/phone/secured', otpLimiter);
router.use('/api/users/login',        authLimiter);
router.use('/api/users/register',     authLimiter);

// Public — no client token
router.use('/api/generic', genericRoutes);

// Public — with client token
router.use('/api/auth',    verifyClientToken, authRoutes);
router.use('/api/users',   verifyClientToken, userRoutes);
router.use('/api/call',    verifyClientToken, callRoutes); 
router.use('/api/devices', verifyClientToken, deviceRoutes);
// Protected — client token + user token
router.use('/api/user',         verifyClientToken, verifyToken, userSingularRoutes);
router.use('/api/me',           verifyClientToken, verifyToken, meRoutes);
router.use('/api/nearby', verifyClientToken, verifyToken, nearbyRoutes);
router.use('/api/chat',         verifyClientToken, verifyToken, chatRoutes);
router.use('/api/support',      verifyClientToken, verifyToken, supportRoutes);
router.use('/api/e2ee',         verifyClientToken, verifyToken, e2eeRoutes);
router.use('/api/moderation',   verifyClientToken, verifyToken, moderationRoutes);

module.exports = router;
