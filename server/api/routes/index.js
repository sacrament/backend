const express       = require('express');
const crypto        = require('crypto');
const rateLimit     = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { verifyToken, verifyClientToken } = require('../../middleware/verify');
const authController = require('../controllers/auth.controller');

const optionalVerifyToken = async (req, res, next) => {
    if (!req.headers.authorization) {
        console.log(`optionalVerifyToken: No Authorization header present`);
        return next();
    }
    console.log(`optionalVerifyToken: Authorization header found, verifying token`);
    return verifyToken(req, res, next);
};

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

// OTP abuse controls. The request signature is HMAC'd with a secret that ships
// inside the mobile binary, so it is extractable and cannot be treated as proof
// the caller is our app. These limits — not the signature — are what actually
// caps SMS spend and protects a victim's phone from being bombed.
//
// Two independent buckets, because they stop different attacks:
//   otpPhoneLimiter — caps how many texts any single number can be sent.
//   otpIpLimiter    — caps a single origin rotating through many numbers, which
//                     the phone-keyed bucket alone cannot see.

const OTP_MAX_PER_PHONE_PER_HOUR = parseInt(process.env.OTP_MAX_PER_PHONE_PER_HOUR) || 5;
const OTP_MAX_PER_IP_PER_HOUR    = parseInt(process.env.OTP_MAX_PER_IP_PER_HOUR)    || 20;

const otpPhoneLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: OTP_MAX_PER_PHONE_PER_HOUR,
    keyGenerator: (req) => {
        const phone = req.body?.phoneNumber || '';
        if (!phone) return ipKeyGenerator(req.ip);
        // Hash the phone number to use as rate limit key
        return `otp_phone:${crypto.createHash('sha256').update(phone).digest('hex')}`;
    },
    message: { status: 'error', code: 429, message: 'Too many OTP requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: OTP_MAX_PER_IP_PER_HOUR,
    keyGenerator: (req) => `otp_ip:${ipKeyGenerator(req.ip)}`,
    message: { status: 'error', code: 429, message: 'Too many OTP requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const appleRevokeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
        const userId = req.decodedToken?.userId || req.body?.appleUserId || ipKeyGenerator(req.ip);
        return `revoke:${userId}`;
    },
    skip: (req) => !req.decodedToken?.userId && !req.body?.appleUserId,
    message: { status: 'error', code: 429, message: 'Too many revoke requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/', (req, res) => res.json({ title: 'Winky' }));
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Dedicated revoke route supporting both authenticated and legacy payload flows
router.post('/api/auth/apple/revoke', appleRevokeLimiter, optionalVerifyToken, authController.appleRevoke);

router.use('/api/webhook', webhookRoutes); // For Twilio status callbacks that don't have client token

// Rate limiters
router.post('/api/auth/phone/secured', otpIpLimiter, otpPhoneLimiter);
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
