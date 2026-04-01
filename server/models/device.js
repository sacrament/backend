const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Device = new Schema({
    // Populated later when the user completes onboarding (PATCH /me/setup)
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    platform: { type: String, enum: ['iOS', 'Android'], required: true },
    uniqueId: { type: String, default: null }, // Optional unique identifier for the device (e.g. UUID)
    os: { type: String, default: null },
    version: { type: String, default: null },
    appVersion: { type: String, default: null },
    info: { type: String, default: null },
    model: { type: String, default: null },
    token: { type: String, default: null },
    voipToken: { type: String, default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    state: { type: String, enum: ['active', 'background'], default: 'active' }
}, { timestamps: true });

mongoose.model('Device', Device);
