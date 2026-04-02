const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const E2EEDevice = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    registrationId: { type: Number, required: true },
    identityKey: { type: String, required: true },
    signedPreKey: {
        id: { type: Number, required: true },
        publicKey: { type: String, required: true },
        signature: { type: String, required: true },
    },
    oneTimePreKeys: [{
        id: { type: Number, required: true },
        publicKey: { type: String, required: true },
    }],
    platform: { type: String, default: 'iOS' },
    name: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
});

mongoose.model('E2EEDevice', E2EEDevice);
