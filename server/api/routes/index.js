const express       = require('express');
const rateLimit     = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { verifyToken, verifyClientToken } = require('../../middleware/verify');

// Route modules
const authRoutes    = require('./auth');
const userRoutes    = require('./user');
const meRoutes      = require('./me');
const nearbyRoutes  = require('./nearby');
const chatRoutes    = require('./chat');
const callRoutes    = require('./call');
const deviceRoutes  = require('./device');
const supportRoutes = require('./support');
const genericRoutes = require('./generic');
const e2eeRoutes    = require('./e2ee');

// ─── Rate limiters ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: { status: 'error', code: 429, message: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => {
        const phone = req.body?.phoneNumber || '';
        return `${ipKeyGenerator(req)}_${phone}`;
    },
    message: { status: 'error', code: 429, message: 'Too many OTP requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/', (req, res) => res.json({ title: 'Winky' }));
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Rate limiters
router.post('/api/auth/phone/secured', otpLimiter);
router.use('/api/users/login',        authLimiter);
router.use('/api/users/register',     authLimiter);

// Public — no client token
router.use('/api/generic', genericRoutes);

// Public — with client token
router.use('/api/auth',    verifyClientToken, authRoutes);
router.use('/api/users',   verifyClientToken, userRoutes);
router.use('/api/calls',   verifyClientToken, callRoutes);
router.use('/api/devices', verifyClientToken, deviceRoutes);
// Protected — client token + user token
router.use('/api/me',           verifyClientToken, verifyToken, meRoutes);
router.use('/api/nearby', verifyClientToken, verifyToken, nearbyRoutes);
router.use('/api/chat',         verifyClientToken, verifyToken, chatRoutes);
router.use('/api/support',      verifyClientToken, verifyToken, supportRoutes);
router.use('/api/e2ee',         verifyClientToken, verifyToken, e2eeRoutes);

module.exports = router;
