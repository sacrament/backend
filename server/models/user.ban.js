const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * UserBan — records a moderation ban action against a user.
 * Written by POST /api/moderation/ban.
 */
const UserBanSchema = new Schema({
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason:       { type: String, required: true },
    warningCount: { type: Number, default: 0 },
    bannedAt:     { type: Date, default: Date.now, index: true },
    restrictions: {
        type: [String],
        enum: ['restricted_calling', 'shadow_banned'],
        default: ['shadow_banned'],
    },
    active: { type: Boolean, default: true, index: true },
    // Null means the ban does not lapse on its own. Temporary restrictions carry a
    // date; the moderation:expire-bans job deactivates them once it passes.
    expiresAt: { type: Date, default: null, index: true },
});

UserBanSchema.index({ userId: 1, active: 1 });

mongoose.model('UserBan', UserBanSchema);
