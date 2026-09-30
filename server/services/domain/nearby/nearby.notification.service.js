/**
 * Nearby Notification Service
 *
 * Triggered whenever a user updates their location.
 * Notifies eligible users in the area via socket (online) or push (offline):
 *   - Generic:    "New users nearby you"        → stranger entered their radar area
 *   - Connection: "Your connection X is nearby" → a connection entered their radar area
 *
 * Online recipients get a silent 'user nearby' socket event every time (the radar
 * refetches). Offline recipients get a push, suppressed per (recipient, movingUser)
 * pair for 30 minutes so rapid location pings don't spam notifications.
 */

const mongoose = require('mongoose');
const { getIO } = require('../../../socket/io');
const { getRadarDistancePresets } = require('./radarPresets');

// Same GPS-uncertainty allowance as GET /nearby/users (MAX_ACCURACY_SLACK_M in
// nearby.controller.js): each side's reported accuracy, capped at this, widens the match.
const MAX_ACCURACY_SLACK_M = 100;

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
     * @param {number} [radiusKm]   - Fixed notification radius for everyone. When omitted
     *                                (the normal case) each recipient is notified within
     *                                their own chosen radar distance (radar.radiusKm), or the
     *                                "nearby" preset if they never picked one — the same
     *                                default the client and GET /nearby/users use.
     * @param {number} [accuracyM]  - Horizontal accuracy of the mover's fix, in metres.
     *                                Widens the match the same way GET /nearby/users does,
     *                                so anyone the radar would show also gets the event.
     */
    async onLocationUpdate(movingUserId, lon, lat, radiusKm, accuracyM) {
        try {
            const presets = await getRadarDistancePresets();
            const defaultKm = presets.nearby;
            // Search out to the widest preset once, then keep each recipient only if the
            // mover is inside *their* distance (recipient.dist is metres from the mover).
            // Widest possible match (largest preset plus both accuracy allowances);
            // each recipient is then checked against their own distance.
            const moverSlackM = Math.min(Number.isFinite(accuracyM) ? accuracyM : 0, MAX_ACCURACY_SLACK_M);
            const searchKm = (radiusKm ?? Math.max(defaultKm, ...Object.values(presets)))
                + (moverSlackM + MAX_ACCURACY_SLACK_M) / 1000;
            const recipientRadiusKm = (recipient) => radiusKm ?? recipient.radar?.radiusKm ?? defaultKm;
            // Real phones indoors are often off by 30-100 m; without this two phones side
            // by side could compute further apart than "Nearby" (91 m) and never get the
            // event, although GET /nearby/users (which applies the same allowance) shows them.
            const allowedDistanceM = (recipient) => recipientRadiusKm(recipient) * 1000
                + moverSlackM + Math.min(recipient.locationAccuracy ?? 0, MAX_ACCURACY_SLACK_M);
            const movingUser = await this._User.findById(movingUserId)
                .populate('device')
                .lean();

            if (!movingUser)                     return;
            if (movingUser.radar?.enabled === false) return; // opted out of radar
            if (movingUser.radar?.invisible)     return; // invisible — don't reveal presence
            if (movingUser.profileVisibility === 'nobody') return; // profile hidden from everyone

            const [nearbyUsers, blockedIds, connectionIds, hiddenFromIds] = await Promise.all([
                this._findUsersNear(lon, lat, searchKm, movingUserId),
                this._getBlockedIds(movingUserId),
                this._getConnectionIds(movingUserId),
                this._getHiddenFromIds(movingUserId),
            ]);

            if (nearbyUsers.length === 0) return;

            // Lazy load singleton to avoid initialization order issues
            const pushNotificationService = require('../../../notifications');
            const io   = getIO();

            await Promise.allSettled(nearbyUsers.map(async (recipient) => {
                const recipientId = recipient._id.toString();

                if (blockedIds.has(recipientId))                              return; // blocked pair
                // The mover "disappeared" from this recipient: GET /nearby/users hides
                // them, so the event (which carries their name and photo) and the
                // "your connection is nearby" push must not reveal them either.
                if (hiddenFromIds.has(recipientId))                           return;
                if (recipient.radar?.enabled === false)                       return; // not on radar
                if (recipient.dist > allowedDistanceM(recipient))             return; // outside their chosen distance

                const isConnection = connectionIds.has(recipientId);
                const sockets      = await io.in(recipientId).fetchSockets();
                const isOnline     = sockets.length > 0;

                if (isOnline) {
                    // Deliver via socket when the user is in the app. No cooldown here:
                    // this is a silent radar refresh, not a notification, and the 30-min
                    // cooldown meant someone relaunching the app nearby never appeared
                    // live on an open radar. The client ignores it for users already shown.
                    io.to(recipientId).emit('user nearby', {
                        userId:       movingUserId,
                        name:         movingUser.name,
                        imageUrl:     movingUser.imageUrl,
                        isConnection,
                    });
                    return;
                }

                // Offline → push notification, rate-limited per pair.
                if (recipient.notificationPreferences?.nearbyWinks === false) return; // opted out of the push
                if (_recentlyNotified(recipientId, movingUserId)) return; // cooldown
                _markNotified(recipientId, movingUserId);

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
     * excluding the moving user themselves. Each result carries `dist` (metres
     * from (lon, lat)) and `locationAccuracy` (their fix's accuracy in metres, or null).
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
            // Carry the distance onto the user doc — the caller filters on each
            // recipient's own radar distance.
            { $addFields: { 'user.dist': '$dist', 'user.locationAccuracy': '$accuracy' } },
            {
                $match: {
                    'user._id':           { $ne: new mongoose.Types.ObjectId(excludeUserId) },
                    'user.status':        'active',
                    'user.radar.enabled': { $ne: false },
                    'user.radar.invisible': { $ne: true },
                    'user.profileVisibility': { $ne: 'nobody' },
                    'user.lastSeen':      { $gt: sixtyMinutesAgo },
                },
            },
            { $replaceRoot: { newRoot: '$user' } },
        ]);
    }

    /** IDs of the users `userId` has disappeared from (hidden themselves from). */
    async _getHiddenFromIds(userId) {
        const records = await mongoose.model('DisappearedUser').find({ user: userId }).select('target').lean();
        return new Set(records.map(r => r.target.toString()));
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
