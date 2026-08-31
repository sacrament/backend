const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const config   = require('../utils/config');
const logger   = require('../utils/logger');

// 6-month epoch in milliseconds (182 days)
const EPOCH_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Derive a signing secret for a given 6-month epoch number.
 * Rotating the base secret or epoch produces a new client secret automatically.
 */
function clientSecretForEpoch(epoch) {
    return `${config.CLIENT_JWT_BASE_SECRET}:${epoch}`;
}

/**
 * Current and previous 6-month epoch numbers.
 * Accepting the previous epoch gives a grace period for users on older app versions.
 */
function validClientEpochs() {
    const current = Math.floor(Date.now() / EPOCH_MS);
    return [current, current - 1];
}

/**
 * Allow inactive/deleted accounts to pass auth only for deletion endpoints.
 * This keeps account deletion idempotent while still protecting other routes.
 */
function isAccountDeletionRequest(request) {
    if (request.method !== 'DELETE') return false;

    const baseUrl = request.baseUrl || '';
    const path = request.path || '';

    return (
        (baseUrl === '/api/user' && path === '/me/deleteAccount') ||
        (baseUrl === '/api/me' && (path === '/' || path === ''))
    );
}

module.exports = {
    /**
     * Gate a route to admins only. Must run after verifyToken.
     */
    requireAdmin: async (request, response, next) => {
        const userId = request.decodedToken?.userId;
        if (!userId) {
            return response.status(401).json({ status: 'error', code: 'NO_TOKEN', message: 'Authentication required.' });
        }

        try {
            // Admin identity lives in its own model — the User model is never
            // extended with moderation concerns. Until that model exists, deny.
            let Admin;
            try { Admin = mongoose.model('Admin'); } catch { Admin = null; }

            const admin = Admin ? await Admin.findOne({ user: userId, active: true }).lean() : null;
            if (!admin) {
                logger.warn(`requireAdmin: denied for userId=${userId} on ${request.method} ${request.originalUrl}`);
                return response.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'Admin access required.' });
            }
            request.isAdmin = true;
            return next();
        } catch (err) {
            logger.error('requireAdmin lookup failed:', err);
            return response.status(500).json({ status: 'error', message: 'Authorization check failed.' });
        }
    },

    /**
     * Verify user authentication token (per-request JWT, 30-day lifetime).
     * Checks token validity then verifies the user's current account status.
     */
    verifyToken: async (request, response, next) => {
        const header = request.headers.authorization;

        if (!header) {
            return response.status(401).json({ status: 'error', code: 'NO_TOKEN', message: 'Authentication required.' });
        }

        const token = header.startsWith('Bearer ') ? header.slice(7) : header;

        let decoded;
        try {
            decoded = jwt.verify(token, config.APP_SECRET);
            logger.debug(`verifyToken: ok userId=${decoded.userId} ${request.method} ${request.originalUrl}`);
        } catch (err) {
            logger.warn(`verifyToken: failed on ${request.method} ${request.originalUrl}. ${err.name}: ${err.message}`);
            if (err.name === 'TokenExpiredError') {
                return response.status(401).json({ status: 'error', code: 'TOKEN_EXPIRED', message: 'Your session has expired. Please log in again.' });
            }
            return response.status(401).json({ status: 'error', code: 'INVALID_TOKEN', message: 'Invalid authentication token.' });
        }

        // Check current account status on every request so blocked/deleted
        // users are denied immediately without waiting for token expiry.
        try {
            const user = await mongoose.model('User').findById(decoded.userId).select('status deleted').lean();

            if (!user) {
                // The account is now genuinely removed rather than flagged, so a
                // repeat deletion call finds nothing. iOS calls DELETE /me and
                // DELETE /user/me/deleteAccount in sequence — failing the second
                // would leave the app showing an error and skipping its local wipe.
                if (!isAccountDeletionRequest(request)) {
                    return response.status(401).json({ status: 'error', code: 'ACCOUNT_NOT_FOUND', message: 'Account not found. Please log in again.' });
                }
            }

            if (user?.status === 'blocked') {
                return response.status(403).json({ status: 'error', code: 'ACCOUNT_BLOCKED', message: 'Your account has been suspended. Please contact support.' });
            }

            if (user && (user.status === 'inactive' || user.status === 'deleted' || user.deleted)) {
                if (!isAccountDeletionRequest(request)) {
                    return response.status(403).json({ status: 'error', code: 'ACCOUNT_INACTIVE', message: 'Your account is no longer active.' });
                }
            }
        } catch (err) {
            logger.error('verifyToken user lookup error:', err.message);
            return response.status(500).json({ status: 'error', code: 'SERVER_ERROR', message: 'Authentication check failed.' });
        }

        request.authToken    = token;
        request.decodedToken = decoded;
        next();
    },

    /**
     * Verify client (app) JWT sent in X-Client-Token header.
     * Accepts tokens from the current or previous 6-month epoch to allow
     * a grace period when the app rotates to a new token.
     */
    verifyClientToken: (request, response, next) => {
        const clientToken = request.headers['x-client-token'] || request.headers['authorization']; // support legacy header for now

        if (!clientToken) {
            return response.status(401).json({
                status: 'error',
                message: 'Client token required'
            });
        }

        for (const epoch of validClientEpochs()) {
            try {
                const secret = clientSecretForEpoch(epoch);
                const decoded = jwt.verify(clientToken, secret);
                if (decoded.type === 'client') {
                    return next();
                }
            } catch {
                // try next epoch
            }
        }

        return response.status(401).json({
            status: 'error',
            message: 'Invalid or expired client token'
        });
    },

    newToken: (userId, scope) => {
        return jwt.sign({ userId, scope }, config.APP_SECRET, { expiresIn: '30d' });
    },
    newRefreshToken: (userId, scope) => {
        return jwt.sign({ userId, scope }, config.APP_SECRET_REFRESH, { expiresIn: '365d' });
    },

    /**
     * Generate a client JWT for the current 6-month epoch.
     * Embed this in each new app release. The token is valid for 182 days
     * and the server also accepts the previous epoch's token for backwards compatibility.
     */
    newClientToken: async () => { 
        const epoch = Math.floor(Date.now() / EPOCH_MS);
        const secret = clientSecretForEpoch(epoch);
        const token = jwt.sign({ type: 'client', epoch }, secret, { expiresIn: '182d' });
        return token;
    }
}