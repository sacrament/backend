/**
 * Nearby Notification Service
 *
 * Triggered whenever a user updates their location.
 * Notifies eligible users in the area via socket (online) or push (offline):
 *   - Generic:    "New users nearby you"        → stranger entered their radar area
 *   - Connection: "Your connection X is nearby" → a connection entered their radar area
 *
 * Deduplication: each (recipient, movingUser) pair is suppressed for 30 minutes
 * so rapid location pings don't spam notifications.
 */

const mongoose = require('mongoose');
const { getIO } = require('../../../socket/io');

// ─── Deduplication store ──────────────────────────────────────────────────────
// Map<recipientId, Map<movingUserId, lastNotifiedTimestamp>>
const _notified = new Map();
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Prune stale entries every hour
setInterval(() => {
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [recipientId, inner] of _notified) {
        for (const [movingId, ts] of inner) {
            if (ts < cutoff) inner.delete(movingId);
        }
        if (inner.size === 0) _notified.delete(recipientId);
    }
}, 60 * 60 * 1000);

// ─── Service ──────────────────────────────────────────────────────────────────

class NearbyNotificationService {
    get _User()              { return mongoose.model('User'); }
    get _Location()          { return mongoose.model('Location'); }
    get _BlockUser()         { return mongoose.model('BlockUser'); }
    get _UserConnectStatus() { return mongoose.model('UserConnectStatus'); }

    /**
     * Call this immediately after a user's location is persisted.
     *
     * @param {string} movingUserId - The user who just moved
     * @param {number} lon          - New longitude
     * @param {number} lat          - New latitude
     * @param {number} radiusKm     - Notification radius (default 300 ft ≈ 0.091 km)
     */
    async onLocationUpdate(movingUserId, lon, lat, radiusKm = 0.091) {
        try {
            const movingUser = await this._User.findById(movingUserId)
                .populate('device')
                .lean();

            if (!movingUser)                     return;
            if (movingUser.radar?.enabled === false) return; // opted out of radar
            if (movingUser.radar?.invisible)     return; // invisible — don't reveal presence

            const [nearbyUsers, blockedIds, connectionIds] = await Promise.all([
                this._findUsersNear(lon, lat, radiusKm, movingUserId),
                this._getBlockedIds(movingUserId),
                this._getConnectionIds(movingUserId),
            ]);

            if (nearbyUsers.length === 0) return;

            // Lazy load singleton to avoid initialization order issues
            const pushNotificationService = require('../../../notifications');
            const io   = getIO();

            await Promise.allSettled(nearbyUsers.map(async (recipient) => {
                const recipientId = recipient._id.toString();

                if (blockedIds.has(recipientId))                              return; // blocked pair
                if (recipient.notificationPreferences?.nearbyWinks === false) return; // opted out
                if (recipient.radar?.enabled === false)                       return; // not on radar
                if (_recentlyNotified(recipientId, movingUserId))             return; // cooldown

                _markNotified(recipientId, movingUserId);

                const isConnection = connectionIds.has(recipientId);
                const sockets      = await io.in(recipientId).fetchSockets();
                const isOnline     = sockets.length > 0;

                if (isOnline) {
                    // Deliver via socket when the user is in the app
                    io.to(recipientId).emit('user nearby', {
                        userId:       movingUserId,
                        name:         movingUser.name,
                        imageUrl:     movingUser.imageUrl,
                        isConnection,
                    });
                    return;
                }

                // Offline → push notification.
                // Re-fetch to get the populated device token (aggregate results are lean).
                const recipientWithDevice = await this._User.findById(recipientId)
                    .populate('device')
                    .lean();

                if (!recipientWithDevice?.device?.token) return;

                if (isConnection) {
                    await pushNotificationService.connectionNearby({ movingUser, recipient: recipientWithDevice });
                } else {
                    await pushNotificationService.newUsersNearby({ recipient: recipientWithDevice });
                }
            }));
        } catch (err) {
            console.error(`NearbyNotificationService.onLocationUpdate — ${err.message}`);
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Find active, radar-visible users near (lon, lat) within radiusKm,
     * excluding the moving user themselves.
     */
    async _findUsersNear(lon, lat, radiusKm, excludeUserId) {
        const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

        return this._Location.aggregate([
            {
                $geoNear: {
                    near:          { type: 'Point', coordinates: [lon, lat] },
                    distanceField: 'dist',
                    maxDistance:   radiusKm * 1000, // metres
                    spherical:     true,
                    query:         { isCurrent: true },
                },
            },
            {
                $lookup: {
                    from:         'users',
                    localField:   '_id',       // Location._id == User.location ref
                    foreignField: 'location',
                    as:           'user',
                },
            },
            { $unwind: '$user' },
            {
                $match: {
                    'user._id':           { $ne: new mongoose.Types.ObjectId(excludeUserId) },
                    'user.status':        'active',
                    'user.radar.enabled': { $ne: false },
                    'user.radar.invisible': { $ne: true },
                    'user.lastSeen':      { $gt: sixtyMinutesAgo },
                },
            },
            { $replaceRoot: { newRoot: '$user' } },
        ]);
    }

    /** Returns IDs of all users who have a block relationship with userId. */
    async _getBlockedIds(userId) {
        const records = await this._BlockUser.find({
            $or: [{ blocker: userId }, { blocked: userId }],
        }).lean();

        const ids = new Set();
        for (const r of records) {
            ids.add(r.blocker.toString());
            ids.add(r.blocked.toString());
        }
        ids.delete(userId.toString());
        return ids;
    }

    /** Returns IDs of all users who are actively connected to userId. */
    async _getConnectionIds(userId) {
        const records = await this._UserConnectStatus.find({
            users:  userId,
            status: 'connected',
        }).lean();

        const ids = new Set();
        for (const r of records) {
            for (const u of r.users) {
                const id = u.toString();
                if (id !== userId.toString()) ids.add(id);
            }
        }
        return ids;
    }
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

function _recentlyNotified(recipientId, movingUserId) {
    const inner = _notified.get(recipientId);
    if (!inner) return false;
    const ts = inner.get(movingUserId);
    return ts !== undefined && Date.now() - ts < COOLDOWN_MS;
}

function _markNotified(recipientId, movingUserId) {
    if (!_notified.has(recipientId)) _notified.set(recipientId, new Map());
    _notified.get(recipientId).set(movingUserId, Date.now());
}

module.exports = NearbyNotificationService;
