const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MutedUser = new Schema({
    muter:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    muted:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
});

MutedUser.index({ muter: 1, muted: 1 }, { unique: true });

mongoose.model('MutedUser', MutedUser);
