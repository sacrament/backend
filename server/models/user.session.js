const mongoose = require('mongoose');

const UserSessionSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    socketId:    { type: String, required: true },
    ip:          { type: String, default: null },
    userAgent:   { type: String, default: null },
    deviceId:    { type: String, default: null },
    transport:   { type: String, default: null },        // 'polling' | 'websocket'
    connectedAt: { type: Date, default: Date.now },
    disconnectedAt: { type: Date, default: null },
    disconnectReason: { type: String, default: null },
    durationMs:  { type: Number, default: null },        // filled on disconnect
});

// TTL: auto-delete sessions older than 90 days
UserSessionSchema.index({ connectedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('UserSession', UserSessionSchema);
