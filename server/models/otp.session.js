const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * OTP Session
 *
 * phoneHash is HMAC-SHA256(OTP_PHONE_HASH_SECRET, phoneNumber) — the raw phone
 * number is never stored. MongoDB's TTL index auto-deletes expired sessions.
 */
const OtpSession = new Schema({
    partition:    { type: String, required: true, unique: false, index: true },
    otp:          { type: String, required: true },
    attempts:     { type: Number, default: 0 },
    requestCount: { type: Number, default: 1 },
    userAgent:    { type: String, default: null },
    ip:           { type: String, required: true },
    expiresAt:    { type: Date,   required: true },
    usedAt:       { type: Date,   default: null },
}, { timestamps: true });

// MongoDB automatically removes documents once expiresAt is reached
OtpSession.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

mongoose.model('PhoneAuthOtp', OtpSession);
