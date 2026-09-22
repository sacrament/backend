const crypto = require('crypto');

// scrypt via Node's built-in crypto — no bcrypt/argon2 dependency in this
// codebase yet, and this is the only place today that needs password hashing
// (everything else is phone-OTP or Apple/Google). Stored as "salt:hash", both
// hex, so a single string round-trips through Mongo with no schema split.
const KEY_LENGTH = 64;

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = (stored || '').split(':');
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, 'hex');
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH);
    return candidate.length === hashBuffer.length && crypto.timingSafeEqual(candidate, hashBuffer);
}

module.exports = { hashPassword, verifyPassword };
