const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BlockUser = new Schema({
    blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    blocked: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, index: true },
    description: { type: String, default: null },
    status: { type: String, enum: ['active', 'inactive', null], default: 'active', index: true },
    createdOn: { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null },
}, {
    versionKey: false,
});

BlockUser.index({ blocker: 1, blocked: 1 }, { unique: true });

mongoose.model('BlockUser', BlockUser);