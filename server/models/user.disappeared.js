const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Disappear — current user hides themselves from a specific target user.
 * The target will no longer see the current user in nearby/radar results.
 */
const DisappearedUser = new Schema({
    user:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
});

DisappearedUser.index({ user: 1, target: 1 }, { unique: true });

mongoose.model('DisappearedUser', DisappearedUser);
