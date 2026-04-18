const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * UserActionLog — client-synced audit trail of user-initiated actions.
 * Written by POST /me/action-logs (batch upload from iOS client).
 */
const UserActionLogSchema = new Schema({
    id:                { type: String, required: true },          // client-side UUID (ActionLog.id)
    actionType:        { type: String, required: true, index: true },
    performedBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason:            { type: String, default: null },
    actionDescription: { type: String, default: null },
    timestamp:         { type: Date, required: true, index: true },
    metadata:          { type: String, default: null },            // JSON string, as sent by client
}, { timestamps: true });

// Fast lookup: all actions by a user, newest first
UserActionLogSchema.index({ performedBy: 1, timestamp: -1 });
// Prevent duplicate uploads of the same client log entry
UserActionLogSchema.index({ id: 1, performedBy: 1 }, { unique: true });

mongoose.model('UserActionLog', UserActionLogSchema);
