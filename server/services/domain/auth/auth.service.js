/**
 * Auth Service
 * Handles OTP lifecycle: generation, storage, verification, and Twilio delivery.
 *
 * Phone numbers are never stored in plain text — sessions are keyed by
 * HMAC-SHA256(OTP_PHONE_HASH_SECRET, phoneNumber), which is consistent
 * (same input → same key) but not reversible without the secret.
 *
 * Expired sessions are automatically removed by MongoDB's TTL index on `expiresAt`.
 */

const crypto      = require('crypto');
const twilio      = require('twilio');
const mongoose    = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const config      = require('../../../utils/config');
const UserService = require('../user/user.service');
const userService = new UserService();
const { newToken, newClientToken } = require('../../../middleware/verify');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

class AuthService {

    get PhoneAuthCollection() {
        return mongoose.model('PhoneAuthOtp');
    }

    /**
     * Derive a consistent, non-reversible hash for a phone number.
     * Used as the session key so raw phone numbers are never persisted.
     */
    #hashPhone(phoneNumber) {
        const pepper = process.env.OTP_PHONE_HASH_SECRET;
        if (!pepper) throw new Error('OTP_PHONE_HASH_SECRET is not set');
        return crypto.createHmac('sha256', pepper).update(phoneNumber).digest('hex');
    }

    /**
     * Request an OTP for a phone number.
     *
     * - No existing session  → generate a new OTP and send it (requestCount: 1)
     * - Existing session, requestCount < 3 → resend the same OTP (requestCount++)
     * - Existing session, requestCount >= 3 → invalidate the session and return an error
     *
     * @param {string} phoneNumber  E.164 phone number
     * @param {{ userAgent?: string, ip: string }} context
     * @returns {Promise<{ requestCount: number }>}
     * @throws {{ code: number, message: string }} when the session is invalidated
     */
    async requestOtp(phoneNumber, { userAgent, ip }) {
        const phoneHash = this.#hashPhone(phoneNumber);
        const existing  = await this.PhoneAuthCollection.findOne({ partition: phoneHash, usedAt: null });

        if (existing && existing.requestCount >= 3) {
            await this.PhoneAuthCollection.deleteOne({ partition: phoneHash });
            const err = new Error('Maximum OTP resend attempts reached. Please try again later.');
            err.code  = 3133;
            throw err;
        }

        let otp;

        if (existing) {
            // Reuse the existing OTP — no new Twilio charge for the same code
            otp = existing.otp;
            await this.PhoneAuthCollection.updateOne(
                { _id: existing._id },
                {
                    $set: { userAgent: userAgent || null, ip },
                    $inc: { requestCount: 1 },
                }
            );
        } else {
            otp = crypto.randomInt(1000, 10000).toString();
            await this.PhoneAuthCollection.create({
                partition: phoneHash,
                otp,
                attempts:     0,
                requestCount: 1,
                userAgent:    userAgent || null,
                ip,
                expiresAt:    new Date(Date.now() + OTP_TTL_MS),
            });
        }

        await this._sendOtp(phoneNumber, otp);

        return { requestCount: existing ? existing.requestCount + 1 : 1 };
    }

    /**
     * Verify an OTP for a phone number.
     * Increments attempt counter on failure. Locks after 5 bad attempts.
     *
     * @param {string} phoneNumber
     * @param {string} otp
     * @returns {Promise<{ valid: boolean, reason?: 'expired'|'locked'|'invalid', attemptsLeft?: number }>}
     */
    async verifyOtp(partition, otp) { 
        const session   = await this.PhoneAuthCollection.findOne({ partition, usedAt: null });

        if (!session) {
            return { valid: false, reason: 'expired' };
        }

        if (session.attempts >= 5) {
            return { valid: false, reason: 'locked' };
        }

        if (session.otp !== otp) {
            await this.PhoneAuthCollection.updateOne({ partition }, { $inc: { attempts: 1 } });
            return { valid: false, reason: 'invalid', attemptsLeft: 5 - (session.attempts + 1) };
        }

        return { valid: true };
    }

    /**
     * Verify OTP, find or create the user, clear the session.
     * This is the single entry point for completing phone authentication.
     *
     * @param {string} phoneNumber
     * @param {string} otp
     * @returns {Promise<{ user: object }>}
     * @throws on invalid/expired/locked OTP or user lookup failure
     */
    async authenticatePhone(phoneNumber, otp) {  
        const partition = this.#hashPhone(phoneNumber);
        const verification = await this.verifyOtp(partition, otp);

        if (!verification.valid) {
            const err     = new Error(
                verification.reason === 'locked'
                    ? 'Too many failed attempts. Please request a new OTP.'
                    : 'Invalid or expired OTP.'
            );
            err.code      = verification.reason === 'locked' ? 3130 : 1014;
            err.httpStatus = verification.reason === 'locked' ? 429 : 401;
            throw err;
        }

        const user = await userService.findOrCreateByPhone(phoneNumber);
        await this.#markOTPUsed(partition);
        return { user: user._doc, ...await this.#issueTokens(user) };
    }

    /**
     * Generate access, refresh, and client tokens for a user.
     * Persists the refresh token to the user document.
     * @param {object} user  Mongoose user document
     * @returns {Promise<{ accessToken: string, refreshToken: string, clientToken: string }>}
     */
    async #issueTokens(user) {
        const userId = user._id.toString();
        const refreshToken = newToken(userId, 'REFRESH_TOKEN_SCOPE');
        const [, clientToken] = await Promise.all([
            userService.saveRefreshToken(userId, refreshToken),
            newClientToken(),
        ]);
        return {
            accessToken: newToken(userId, 'ACCESS'),
            refreshToken,
            clientToken,
        };
    }

    /**
     * Soft-delete the OTP session after successful authentication.
     * The record is kept for audit; usedAt marks it as consumed.
     * MongoDB's TTL index still cleans it up once expiresAt passes.
     * @param {string} phoneNumber
     */
    async #markOTPUsed(partition) {
        await this.PhoneAuthCollection.updateOne(
            { partition },
            { $set: { usedAt: new Date() } }
        );
    }

    /**
     * Verify an Apple identity token and authenticate the user.
     * Finds or creates the user by appleId, then issues tokens.
     *
     * @param {string} appleToken  Identity token from Sign in with Apple
     * @returns {Promise<{ user, accessToken, refreshToken, clientToken }>}
     */
    async authenticateApple(appleToken) {
        // TODO: replace stub with real JWT verification using Apple's public keys
        // e.g. apple-signin-auth package: appleSignin.verifyIdToken(appleToken, { audience: BUNDLE_ID })
        const payload = await this.#verifyAppleToken(appleToken);

        if (!payload?.sub) {
            const err = new Error('Invalid Apple token');
            err.httpStatus = 401; err.code = 1008;
            throw err;
        }

        const appleUser = {
            id:    payload.sub,
            name:  payload.name  || null,
            email: payload.email || null,
        };

        const user = await userService.findOrCreateByApple(appleUser);
        return { user, ...await this.#issueTokens(user) };
    }

    /**
     * Stub: validate Apple identity token.
     * Replace with real Apple JWT verification before going to production.
     */
    async #verifyAppleToken(token) {
        // Real implementation: decode + verify against Apple's JWKS endpoint
        // https://appleid.apple.com/auth/keys
        return {
            sub:   'apple_stub_' + token.slice(-8),
            name:  null,
            email: null,
        };
    }

    /**
     * Verify a Google ID token and authenticate the user.
     * Finds or creates the user by googleId, then issues tokens.
     *
     * @param {string} idToken  Google ID token from the Android client
     * @returns {Promise<{ user, accessToken, refreshToken, clientToken }>}
     */
    async authenticateGoogle(idToken) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured');

        const client  = new OAuth2Client(clientId);
        const ticket  = await client.verifyIdToken({ idToken, audience: clientId });
        const payload = ticket.getPayload();

        if (!payload?.sub) {
            const err = new Error('Invalid Google token');
            err.httpStatus = 401; err.code = 1020;
            throw err;
        }

        const googleUser = {
            id:      payload.sub,
            name:    payload.name    || null,
            email:   payload.email   || null,
            picture: payload.picture || null,
        };

        const user = await userService.findOrCreateByGoogle(googleUser);
        return { user, ...await this.#issueTokens(user) };
    }

    /**
     * Send OTP via Twilio SMS.
     * @param {string} phoneNumber  E.164 destination
     * @param {string} otp
     */
    async _sendOtp(phoneNumber, otp) {
        const client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN);
        try {
            await client.messages.create({
                body: `Your Winky code is ${otp}. Valid for 5 minutes. Never share this code.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber,
            });
        } catch (error) {
            console.error('Twilio SMS send error:', { message: error.message, code: error.code });
            const err = new Error('Failed to send SMS. Please check your phone number and try again.');
            err.code = 5001;
            err.httpStatus = 502;
            throw err;
        }
    }
}

module.exports = new AuthService();
