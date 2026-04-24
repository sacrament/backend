const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PendingSocketEvent = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    event: {
        type: String,
        required: true,
        trim: true,
    },
    payload: {
        type: Schema.Types.Mixed,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        index: { expires: 0 },
    },
});

PendingSocketEvent.index({ userId: 1, createdAt: 1 });

mongoose.model('PendingSocketEvent', PendingSocketEvent);