const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const CallHistory = new Schema({
    roomId:          { type: String, index: true },
    from:            { type: Schema.Types.ObjectId, ref: 'User', index: true },
    to:              { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName:        { type: String, default: null },         // Twilio room uniqueName
    callType:        { type: String, enum: ['voice', 'video'], default: 'voice' },

    // Lifecycle timestamps
    startedAt:       { type: Date, default: Date.now, index: true },  // room created
    answeredAt:      { type: Date, default: null },                    // receiver joined
    endedAt:         { type: Date, default: null },

    // Outcome
    status:          { type: String, enum: ['ringing', 'answered', 'ended', 'missed', 'rejected', 'error'], default: 'ringing', index: true },
    durationSeconds: { type: Number, default: null },                  // filled on end
    answered:        { type: Boolean, default: false },

    // Network/device metadata
    ipAddress:       { type: String, default: null },
    networkInfo:     { type: String, default: null },

    // Missed call rate-limiting counter
    missedCallCount: { type: Number, default: 0 },
});

CallHistory.index({ from: 1, to: 1, startedAt: -1 });
CallHistory.index({ to: 1, status: 1, startedAt: -1 });  
 
mongoose.model('CallHistory', CallHistory); 

module.exports = CallHistory;
