const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Location = new Schema({
    user:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    point: {
        type:        { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    // Horizontal accuracy of the fix in metres, as reported by the device. Null for
    // clients that don't send it (and for manually-set locations).
    accuracy:   { type: Number, default: null },
    isCurrent:  { type: Boolean, default: true, index: true },
    recordedAt: { type: Date, default: Date.now },
    expiresAt:  { type: Date, default: null },
});

// Geo queries
Location.index({ point: '2dsphere' });

// TTL — MongoDB auto-deletes documents once expiresAt is reached
Location.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

mongoose.model('Location', Location);
