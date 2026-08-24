const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../../../utils/logger');
const { deleteMedia } = require('../../external/aws/s3.service');

/**
 * AccountDeletionService
 *
 * Real account deletion. The user's account, profile and identifiers are removed;
 * content already delivered to another user is retained in that user's history,
 * attributed to a user that no longer resolves.
 *
 * See docs/SAFETY_REPORTING_AND_ACCOUNT_DELETION_SPEC.md (Part B).
 *
 * Mongo multi-document transactions require a replica set, so this is written to be
 * idempotent instead: every stage is safe to re-run, the tombstone is written first
 * so statistics survive a crash, and the User document is deleted last so a partial
 * run always leaves the account unreachable rather than half-alive.
 */
class AccountDeletionService {

    model(name) {
        return mongoose.model(name);
    }

    /**
     * Keyed hash, matching AuthService.hashPhone. A plain digest of a phone number
     * is brute-forceable in seconds, so the pepper is what keeps these irreversible.
     */
    hash(value) {
        if (!value) return null;
        const pepper = process.env.OTP_PHONE_HASH_SECRET;
        if (!pepper) throw new Error('OTP_PHONE_HASH_SECRET is not set');
        return crypto.createHmac('sha256', pepper).update(String(value)).digest('hex');
    }

    ageBucket(age) {
        if (typeof age !== 'number' || Number.isNaN(age)) return null;
        if (age < 25) return '18-24';
        if (age < 35) return '25-34';
        if (age < 45) return '35-44';
        if (age < 55) return '45-54';
        return '55+';
    }

    /**
     * Delete an account. Safe to call repeatedly — a second call for an already
     * deleted user is a no-op.
     */
    async deleteAccount(userId, reason = 'User initiated') {
        const User = this.model('User');

        const user = await User.findById(userId).lean();
        if (!user) {
            // Already fully deleted, or never existed. Idempotent either way.
            const existing = await this.model('DeletedUser').findOne({ userId }).lean();
            if (existing) return { status: 'already_deleted' };
            throw new Error('User not found');
        }

        await this.writeTombstone(user, reason);

        // From here the account must not be usable, even if a later stage fails.
        await User.updateOne({ _id: userId }, { $set: { status: 'deleted', refreshToken: null } });

        await this.applySafetyRetention(userId);
        await this.purgePersonalRecords(userId, user);
        await this.detachFromOtherUsers(userId);
        await this.stripDeliveredContent(userId);

        await User.deleteOne({ _id: userId });

        logger.info(`Account deleted: ${userId} (${reason})`);
        return { status: 'deleted' };
    }

    // ─── Stage 1 — tombstone ──────────────────────────────────────────────────

    async writeTombstone(user, reason) {
        const userId = user._id;
        const now = new Date();

        const [messagesSent, chatsCount, connectionsCount, callsCount,
               reportsFiled, reportsAgainst, timesBlocked, banCount, device] = await Promise.all([
            this.model('Message').countDocuments({ from: userId }),
            this.model('Chat').countDocuments({ 'members.user': userId }),
            require('../../../models/user.connect').UserConnectStatus.countDocuments({ users: userId, status: 'connected' }),
            this.model('CallHistory').countDocuments({ $or: [{ from: userId }, { to: userId }] }),
            this.model('Report').countDocuments({ reporter: userId }),
            this.model('Report').countDocuments({ reported: userId }),
            this.model('BlockUser').countDocuments({ blocked: userId }),
            this.model('UserBan').countDocuments({ userId }),
            this.model('Device').findOne({ user: userId }).select('platform').lean(),
        ]);

        const accountAgeDays = user.registeredOn
            ? Math.max(0, Math.floor((now.getTime() - new Date(user.registeredOn).getTime()) / 86400000))
            : null;

        await this.model('DeletedUser').updateOne(
            { userId },
            {
                $setOnInsert: {
                    userId,
                    // partition is already the keyed phone hash; hash the rest to match.
                    phoneHash:    user.partition || this.hash(user.phone),
                    emailHash:    this.hash(user.email && user.email.trim().toLowerCase()),
                    appleIdHash:  this.hash(user.appleId),
                    googleIdHash: this.hash(user.googleId),

                    deletedOn: now,
                    reason,

                    registeredOn:   user.registeredOn || null,
                    lastLogin:      user.lastLogin || null,
                    accountAgeDays,
                    devicePlatform: device?.platform || null,
                    // Recorded at signup from the phone's calling code.
                    country:        user.country || null,

                    authProvider: {
                        apple:  !!user.appleId,
                        google: !!user.googleId,
                        phone:  !!(user.partition || user.phone),
                    },

                    gender:       user.gender || null,
                    ageBucket:    this.ageBucket(user.age),
                    interestedIn: user.interestedIn || null,

                    activity: {
                        messagesSent, chatsCount, connectionsCount, callsCount,
                        reportsFiled, reportsAgainst, timesBlocked,
                        wasBanned: banCount > 0,
                    },
                },
            },
            { upsert: true }
        );
    }

    // ─── Stage 2 — safety retention (B6) ──────────────────────────────────────

    /**
     * Reports and bans are retained only where they exist. A user who was never
     * reported and never banned leaves nothing behind but the tombstone.
     *
     * Retained records keep the original ObjectId, which after deletion resolves to
     * nothing and therefore acts as the pseudonymous key.
     */
    async applySafetyRetention(userId) {
        // Reports they filed stay on the accused's record, with the reporter dropped.
        await this.model('Report').updateMany(
            { reporter: userId },
            { $set: { reporter: null } }
        );
        // Reports against them and their bans are left untouched; the TTL purge in
        // B6 governs how long they live.
    }

    // ─── Stage 3 — purge personal records ─────────────────────────────────────

    async purgePersonalRecords(userId, user) {
        const UserRequest = require('../../../models/user.request').UserRequest;
        const UserConnectStatus = require('../../../models/user.connect').UserConnectStatus;
        const SavedUser = require('../../../models/user.saved').SavedUser;

        await Promise.all([
            this.model('Device').deleteMany({ user: userId }),
            this.model('UserSession').deleteMany({ userId }),
            this.model('Location').deleteMany({ user: userId }),

            // Key material — deleting this crypto-shreds anything only they could read.
            this.model('E2EEDevice').deleteMany({ user: userId }),
            this.model('E2EEKeyBackup').deleteMany({ user: userId }),
            this.model('KeyBackup').deleteMany({ userId }),
            this.model('KeyEscrow').deleteMany({ userId }),

            this.model('ProfileView').deleteMany({ $or: [{ viewer: userId }, { viewed: userId }] }),
            this.model('NearbyUsersLog').deleteMany({ $or: [{ userId }, { nearbyUserId: userId }] }),
            this.model('BlockUser').deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] }),
            this.model('MutedUser').deleteMany({ $or: [{ muter: userId }, { muted: userId }] }),
            this.model('DisappearedUser').deleteMany({ $or: [{ user: userId }, { target: userId }] }),
            this.model('ContentStorage').deleteMany({ $or: [{ from: userId }, { receiver: userId }] }),
            this.model('PendingSocketEvent').deleteMany({ userId }),
            this.model('CallRequest').deleteMany({ $or: [{ from: userId }, { to: userId }] }),
            this.model('Reaction').deleteMany({ from: userId }),

            UserRequest.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
            UserConnectStatus.deleteMany({ users: userId }),
            SavedUser.deleteMany({ $or: [{ user: userId }, { savedUser: userId }] }),
        ].map(p => p.catch(err => logger.warn(`Deletion stage failed (non-fatal): ${err.message}`))));

        // Profile photo is theirs alone, so the S3 object goes with the account.
        if (user.imageUrl) {
            const key = String(user.imageUrl).split('/').pop();
            if (key) {
                try { await deleteMedia(key); }
                catch (err) { logger.warn(`Failed to delete avatar ${key}: ${err.message}`); }
            }
        }
    }

    // ─── Stage 4 — detach from other users ────────────────────────────────────

    async detachFromOtherUsers(userId) {
        await this.model('User').updateMany(
            { $or: [{ favorites: userId }, { hiddenUsers: userId }] },
            { $pull: { favorites: userId, hiddenUsers: userId } }
        );
    }

    // ─── Stage 5 — delivered content (B5) ─────────────────────────────────────

    /**
     * Messages, media and call history stay so the other party keeps their history.
     * Only what belongs solely to the deleted user is removed.
     */
    async stripDeliveredContent(userId) {
        await Promise.all([
            // The sender's own copy is theirs alone — dropping it makes their side
            // irrecoverable while leaving the recipient's copy intact.
            this.model('Message').updateMany({ from: userId }, { $set: { senderCopy: null } }),

            // Call metadata that identifies them beyond the fact of the call.
            this.model('CallHistory').updateMany(
                { $or: [{ from: userId }, { to: userId }] },
                { $set: { ipAddress: null, networkInfo: null } }
            ),

            // Membership row stays: chat.handler.js treats a private chat with fewer
            // than two canChat members as invalid, so removing it would break the
            // surviving user's thread. Read-only is the correct end state.
            this.model('Chat').updateMany(
                { 'members.user': userId },
                { $set: { 'members.$[m].canChat': false, 'members.$[m].options.blocked': false } },
                { arrayFilters: [{ 'm.user': userId }] }
            ),
        ]);
    }
}

module.exports = AccountDeletionService;
