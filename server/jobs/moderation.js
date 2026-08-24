/**
 * Moderation Jobs
 *
 * Lapses temporary restrictions once their expiry passes, and clears out bans
 * that are no longer needed as a record.
 *
 * Reports clean themselves up: Report.purgeAt carries a TTL index, set when a
 * report is resolved or dismissed. Bans need a job because a lapsed ban must stay
 * readable for a while after it stops applying.
 *
 * See docs/SAFETY_REPORTING_AND_ACCOUNT_DELETION_SPEC.md (B6).
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// How long an inactive ban is kept after it lapses, as a moderation record.
const INACTIVE_BAN_RETENTION_DAYS = 365;

module.exports = (agenda) => {
    agenda.define('moderation:expire-bans', async () => {
        const UserBan = mongoose.model('UserBan');
        const now = new Date();

        const lapsed = await UserBan.updateMany(
            { active: true, expiresAt: { $ne: null, $lte: now } },
            { $set: { active: false } }
        );

        if (lapsed.modifiedCount) {
            logger.info(`moderation:expire-bans lapsed ${lapsed.modifiedCount} restriction(s)`);
        }

        // Permanent bans have no expiresAt and are never purged here.
        const cutoff = new Date(now.getTime() - INACTIVE_BAN_RETENTION_DAYS * 86400000);
        const purged = await UserBan.deleteMany({
            active: false,
            expiresAt: { $ne: null, $lte: cutoff },
        });

        if (purged.deletedCount) {
            logger.info(`moderation:expire-bans purged ${purged.deletedCount} expired ban record(s)`);
        }
    });

    agenda.every('1 hour', 'moderation:expire-bans');
};
