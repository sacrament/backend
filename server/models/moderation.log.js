const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * ModerationLog — append-only audit trail for moderation events.
 * Written by POST /api/moderation/log.
 */
const ModerationLogSchema = new Schema({
    event: {
        type: String,
        enum: ['first_message', 'warning', 'ban', 'disappear', 'report', 'excessive_calls', 'permission_violation'],
        required: true,
        index: true,
    },
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetId:  { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    details:   { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
});

ModerationLogSchema.index({ userId: 1, event: 1, timestamp: -1 });

mongoose.model('ModerationLog', ModerationLogSchema);
