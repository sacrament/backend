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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const config = require('../../../utils/config');
const UserService = require('../user/user.service');
const userService = new UserService();
const { newToken, newClientToken } = require('../../../middleware/verify');

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

class AuthService {

    get PhoneAuthCollection() {
        return mongoose.model('PhoneAuthOtp');
    }

    hashPhone(phoneNumber) {
        const pepper = process.env.OTP_PHONE_HASH_SECRET;
        if (!pepper) throw new Error('OTP_PHONE_HASH_SECRET is not set');
        return crypto.createHmac('sha256', pepper).update(phoneNumber).digest('hex');
    }


    async requestOtp(phoneNumber, { userAgent, ip }) {
        const phoneHash = this.hashPhone(phoneNumber);
        const existing = await this.PhoneAuthCollection.findOne({ partition: phoneHash, usedAt: null });
        if (existing && existing.requestCount >= 3) {
            await this.PhoneAuthCollection.deleteOne({ partition: phoneHash });
            const err = new Error('Maximum OTP resend attempts reached. Please try again later.');
            err.code = 3133;
            throw err;
        }
        let otp;
        if (existing) {
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
                attempts: 0,
                requestCount: 1,
                userAgent: userAgent || null,
                ip,
                expiresAt: new Date(Date.now() + OTP_TTL_MS),
            });
        }
        await this._sendOtp(phoneNumber, otp);
        return { requestCount: existing ? existing.requestCount + 1 : 1 };
    }

    async verifyOtp(partition, otp) {
        const session = await this.PhoneAuthCollection.findOne({ partition, usedAt: null });
        if (!session) {
            return { valid: false, reason: 'expired' };
        }
        if (session.attempts >= 3) {
            return { valid: false, reason: 'locked' };
        }
        if (session.otp !== otp) {
            await this.PhoneAuthCollection.updateOne({ partition }, { $inc: { attempts: 1 } });
            return { valid: false, reason: 'invalid', attemptsLeft: 3 - (session.attempts + 1) };
        }
        return { valid: true };
    }

    async authenticatePhone(phoneNumber, otp, deviceId = null) {
        const partition = this.hashPhone(phoneNumber);
        const verification = await this.verifyOtp(partition, otp);
        if (!verification.valid) {
            const err = new Error(
                verification.reason === 'locked'
                    ? 'Too many failed attempts. Please request a new OTP.'
                    : 'Invalid or expired OTP.'
            );
            err.code = verification.reason === 'locked' ? 3130 : 1014;
            err.httpStatus = verification.reason === 'locked' ? 429 : 401;
            throw err;
        }
        const { user, accountExisted } = await userService.findOrCreateByPhone(phoneNumber);
        await this.markOTPUsed(partition);
        return { user, accountExisted, ...(await this.issueTokens(user, deviceId)) };
    }

    async markOTPUsed(partition) {
        await this.PhoneAuthCollection.updateOne(
            { partition },
            { $set: { usedAt: new Date() } }
        );
    }

    async issueTokens(user, deviceId = null) {
        const userId = user._id.toString();
        if (user.refreshToken) {
            try {
                const { getIO } = require('../../../socket/io');
                const io = getIO();
                
                // Get all sockets for this user
                const userSockets = await io.in(userId).fetchSockets();
                
                // Emit to all sockets except the one with matching deviceId
                for (const socket of userSockets) {
                    if (!deviceId || socket.deviceId !== deviceId) {
                        socket.emit('session displaced', {
                            reason: 'Your account was signed in on another device.',
                        });
                    }
                }
            } catch (_) { }
            await userService.disableUserDeviceFor(userId);
        }
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

    async authenticateApple(appleToken, email, name, appleAccessToken, appleRefreshToken, appleAuthorizationCode, deviceId = null) {
        const jwt = require('jsonwebtoken');
        let resolvedAppleAccessToken = appleAccessToken || null;
        let resolvedAppleRefreshToken = appleRefreshToken || null;

        // Attempt authorization code exchange if tokens not provided
        if ((!resolvedAppleAccessToken || !resolvedAppleRefreshToken) && appleAuthorizationCode) {
            try {
                const exchanged = await this.exchangeAppleAuthorizationCode(appleAuthorizationCode);
                resolvedAppleAccessToken = resolvedAppleAccessToken || exchanged.accessToken || null;
                resolvedAppleRefreshToken = resolvedAppleRefreshToken || exchanged.refreshToken || null;
                console.log(`Apple auth: Exchanged code successfully. Got refresh=${!!resolvedAppleRefreshToken}`);
            } catch (error) {
                console.warn(`Apple authorization code exchange failed: ${error.message}`);
            }
        }

        // Fallback: store identity token as access token if no other token available
        if (!resolvedAppleAccessToken && appleToken) {
            resolvedAppleAccessToken = appleToken;
            console.log(`Apple auth: Storing identity token as fallback access token`);
        }

        let payload;
        if (email && name) {
            const decoded = jwt.decode(appleToken, { complete: true });
            if (!decoded?.payload?.sub) {
                const err = new Error('Invalid Apple token format');
                err.httpStatus = 401; err.code = 1008;
                throw err;
            }
            payload = decoded.payload;
        } else {
            payload = await this.verifyAppleToken(appleToken);
        }
        if (!payload?.sub) {
            const err = new Error('Invalid Apple token');
            err.httpStatus = 401; err.code = 1008;
            throw err;
        }
        const appleUser = {
            id: payload.sub,
            name: name || payload.name || null,
            email: email || payload.email || null,
        };
        const { user, accountExisted } = await userService.findOrCreateByApple(
            appleUser,
            resolvedAppleAccessToken,
            resolvedAppleRefreshToken,
        );
        console.log(`Apple auth: Stored user ${user._id} with refresh=${!!user.appleRefreshToken}, access=${!!user.appleAccessToken}`);
        return { user, accountExisted, ...(await this.issueTokens(user, deviceId)) };
    }

    async verifyAppleToken(token) {
        const jwt = require('jsonwebtoken');
        const https = require('https');
        const bundleId = process.env.IOS_BUNDLE;
        if (!bundleId) {
            throw new Error('IOS_BUNDLE is not configured');
        }
        try {
            const decoded = jwt.decode(token, { complete: true });
            if (!decoded) {
                throw new Error('Invalid token format');
            }
            const { header } = decoded;
            const kid = header.kid;
            const keys = await this.fetchAppleJWKS();
            const key = keys.find(k => k.kid === kid);
            if (!key) {
                throw new Error('Key not found in Apple JWKS');
            }
            const publicKeyPem = this.jwksKeyToPem(key);
            const verified = jwt.verify(token, publicKeyPem, {
                algorithms: ['RS256'],
                audience: bundleId,
                issuer: 'https://appleid.apple.com',
            });
            return verified;
        } catch (error) {
            console.error('Apple token verification error:', error.message);
            const err = new Error('Failed to verify Apple token');
            err.httpStatus = 401;
            err.code = 1008;
            throw err;
        }
    }

    fetchAppleJWKS() {
        return new Promise((resolve, reject) => {
            const https = require('https');
            https.get('https://appleid.apple.com/auth/keys', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.keys);
                    } catch (e) {
                        reject(new Error('Failed to parse Apple JWKS'));
                    }
                });
            }).on('error', reject);
        });
    }

    jwksKeyToPem(jwksKey) {
        const crypto = require('crypto');
        const keyObject = crypto.createPublicKey({
            key: {
                kty: 'RSA',
                n: String(jwksKey.n),
                e: String(jwksKey.e),
            },
            format: 'jwk',
        });
        return keyObject.export({
            format: 'pem',
            type: 'spki',
        });
    }

    async revokeAppleToken(token, tokenTypeHint = 'access_token') {
        const jwt = require('jsonwebtoken');
        const https = require('https');
        const clientId = process.env.APPLE_CLIENT_ID || process.env.IOS_BUNDLE;
        const teamId = process.env.APPLE_TEAM_ID || process.env.IOS_TEAM_ID;
        const keyId = process.env.APPLE_KEY_ID || process.env.IOS_KEY_TOKEN;

        let privateKey = process.env.APPLE_PRIVATE_KEY
            ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : null;

        if (!privateKey) {
            const configuredPath = process.env.APPLE_PRIVATE_KEY_PATH;
            const fallbackPaths = keyId ? [
                path.join(process.cwd(), 'server', 'certs', `AuthKey_${keyId}.p8`),
                path.join(process.cwd(), 'certs', `AuthKey_${keyId}.p8`),
                path.resolve(__dirname, '../../../certs', `AuthKey_${keyId}.p8`),
            ] : [];
            const keyPathCandidates = [configuredPath, ...fallbackPaths].filter(Boolean);
            const keyPath = keyPathCandidates.find(candidate => fs.existsSync(candidate));

            if (keyPath) {
                privateKey = fs.readFileSync(keyPath, 'utf8');
            }
        }

        if (!clientId || !teamId || !keyId || !privateKey) {
            throw new Error('Apple credentials missing in environment (client/team/key/private key)');
        }
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: teamId,
            iat: now,
            exp: now + 60 * 5,
            aud: 'https://appleid.apple.com',
            sub: clientId
        };
        const clientSecret = jwt.sign(payload, privateKey, {
            algorithm: 'ES256',
            keyid: keyId,
        });
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            token,
            token_type_hint: tokenTypeHint,
        });
        await new Promise((resolve, reject) => {
            const req = https.request({
                method: 'POST',
                hostname: 'appleid.apple.com',
                path: '/auth/revoke',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log(`Apple revoke succeeded for token_type_hint=${tokenTypeHint}`);
                        resolve();
                    } else {
                        try {
                            const parsed = JSON.parse(data);
                            console.error(`Apple revoke failed (${res.statusCode}, hint=${tokenTypeHint}): ${parsed.error || data}`);
                        } catch {
                            console.error(`Apple revoke failed (${res.statusCode}, hint=${tokenTypeHint}): ${data}`);
                        }
                        reject(new Error('Apple revoke failed: ' + data));
                    }
                });
            });
            req.on('error', reject);
            req.write(params.toString());
            req.end();
        });
    }

    async revokeAppleTokens(tokenCandidates = []) {
        const normalized = tokenCandidates
            .filter(candidate => candidate && candidate.token)
            .map(candidate => ({ token: String(candidate.token), tokenTypeHint: candidate.tokenTypeHint || 'access_token' }));

        const seen = new Set();
        const uniqueCandidates = normalized.filter(candidate => {
            const key = `${candidate.tokenTypeHint}:${candidate.token}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        let successCount = 0;
        let lastError = null;

        for (const candidate of uniqueCandidates) {
            try {
                await this.revokeAppleToken(candidate.token, candidate.tokenTypeHint);
                successCount++;
            } catch (error) {
                // For identity tokens (JWTs), try alternative type hints
                const isJwt = candidate.token.split('.').length === 3;
                const alternativeHints = candidate.tokenTypeHint === 'access_token' 
                    ? ['id_token', 'refresh_token'] 
                    : ['access_token', 'id_token'];

                if (isJwt) {
                    for (const altHint of alternativeHints) {
                        try {
                            await this.revokeAppleToken(candidate.token, altHint);
                            console.log(`Apple revoke succeeded with alternative hint ${altHint}`);
                            successCount++;
                            break;
                        } catch (_altError) {
                            // Continue to next alternative
                        }
                    }
                }

                if (successCount === 0) {
                    lastError = error;
                    console.warn(`Apple revoke failed for ${candidate.tokenTypeHint}: ${error.message}`);
                }
            }
        }

        if (successCount === 0) {
            throw lastError || new Error('Apple revoke failed for all token candidates');
        }

        return { successCount };
    }

    async exchangeAppleAuthorizationCode(authorizationCode) {
        const jwt = require('jsonwebtoken');
        const https = require('https');
        const clientId = process.env.APPLE_CLIENT_ID || process.env.IOS_BUNDLE;
        const teamId = process.env.APPLE_TEAM_ID || process.env.IOS_TEAM_ID;
        const keyId = process.env.APPLE_KEY_ID || process.env.IOS_KEY_TOKEN;

        let privateKey = process.env.APPLE_PRIVATE_KEY
            ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : null;

        if (!privateKey) {
            const configuredPath = process.env.APPLE_PRIVATE_KEY_PATH;
            const fallbackPaths = keyId ? [
                path.join(process.cwd(), 'server', 'certs', `AuthKey_${keyId}.p8`),
                path.join(process.cwd(), 'certs', `AuthKey_${keyId}.p8`),
                path.resolve(__dirname, '../../../certs', `AuthKey_${keyId}.p8`),
            ] : [];
            const keyPathCandidates = [configuredPath, ...fallbackPaths].filter(Boolean);
            const keyPath = keyPathCandidates.find(candidate => fs.existsSync(candidate));

            if (keyPath) {
                privateKey = fs.readFileSync(keyPath, 'utf8');
            }
        }

        if (!clientId || !teamId || !keyId || !privateKey) {
            const missing = [
                !clientId && 'clientId',
                !teamId && 'teamId',
                !keyId && 'keyId',
                !privateKey && 'privateKey'
            ].filter(Boolean).join(', ');
            throw new Error(`Apple credentials missing: ${missing}`);
        }

        console.log(`Apple exchange: clientId=${clientId.substring(0,6)}..., teamId=${teamId.substring(0,6)}..., keyId=${keyId}`);


        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: teamId,
            iat: now,
            exp: now + 60 * 5,
            aud: 'https://appleid.apple.com',
            sub: clientId,
        };

        const clientSecret = jwt.sign(payload, privateKey, {
            algorithm: 'ES256',
            keyid: keyId,
        });

        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: authorizationCode,
            grant_type: 'authorization_code',
        });

        const response = await new Promise((resolve, reject) => {
            const req = https.request({
                method: 'POST',
                hostname: 'appleid.apple.com',
                path: '/auth/token',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        if (res.statusCode === 200) {
                            console.log(`Apple exchange success: received access_token=${!!parsed.access_token}, refresh_token=${!!parsed.refresh_token}`);
                            resolve(parsed);
                        } else {
                            const errorDetail = parsed.error_description || parsed.error || data;
                            console.error(`Apple exchange failed (${res.statusCode}): ${errorDetail}`);
                            reject(new Error(`Apple token exchange failed: ${parsed.error || data}`));
                        }
                    } catch (_err) {
                        reject(new Error('Apple token exchange response parse error'));
                    }
                });
            });

            req.on('error', reject);
            req.write(params.toString());
            req.end();
        });

        return {
            accessToken: response.access_token || null,
            refreshToken: response.refresh_token || null,
        };
    }

    async authenticateGoogle(idToken, deviceId = null) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const iosClientId = process.env.GOOGLE_CLIENT_ID_IOS;
        if (!clientId && !iosClientId) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID_IOS is not configured');
        // ID tokens carry an `aud` claim matching whichever OAuth client requested them,
        // so Android and iOS tokens need to both be accepted here.
        const audience = [clientId, iosClientId].filter(Boolean);
        const client = new OAuth2Client();
        const ticket = await client.verifyIdToken({ idToken, audience });
        const payload = ticket.getPayload();
        if (!payload?.sub) {
            const err = new Error('Invalid Google token');
            err.httpStatus = 401; err.code = 1020;
            throw err;
        }
        const googleUser = {
            id: payload.sub,
            name: payload.name || null,
            email: payload.email || null,
            picture: payload.picture || null,
        };
        const { user, accountExisted } = await userService.findOrCreateByGoogle(googleUser);
        return { user, accountExisted, ...(await this.issueTokens(user, deviceId)) };
    }

    async _sendOtp(phoneNumber, otp) {
        const client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN);
        try {
            await client.messages.create({
                body: `Your Winky code is ${otp}. Valid for 15 minutes. Never share this code.`,
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
