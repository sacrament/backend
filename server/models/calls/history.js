const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const CallHistory = new Schema({
    roomId: { type: String },
    from: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName: { type: String, default: null },
    date: { type: Date, default: Date.now, index: true },
    type: { type: String, enum: ['initiated', 'answered', 'rejected', 'incoming', 'outgoing', 'missed', 'error', 'ended'], default: 'initiated', index: true },
    pictureUrl: { type: String, default: null },
    description: { type: String, default: null },
    token: { type: String, default: null },
    other: { type: String, default: null },
    duration: { type: String, default: null },
    // Call type: voice or video
    callType: { type: String, enum: ['voice', 'video'], default: 'voice' },
    // Missed call tracking for rate limiting
    missedCallCount: { type: Number, default: 0 }
});

// Compound indexes for efficient queries
CallHistory.index({ from: 1, to: 1, date: -1 });
CallHistory.index({ to: 1, type: 1, date: -1 });  
 
mongoose.model('CallHistory', CallHistory); 

module.exports = CallHistory;
 