const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const CallHistory = new Schema({
    roomId: { type: String },
    from: { type: Schema.Types.ObjectId, ref: 'User' },
    to: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, default: null },
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['initiated', 'answered', 'rejected', 'incoming', 'outgoing', 'missed', 'error', 'ended'], default: 'initiated' },
    pictureUrl: { type: String, default: null },
    description: { type: String, default: null },
    token: { type: String, default: null },
    other: { type: String, default: null },
    duration: { type: String, default: null }
});  
 
mongoose.model('CallHistory', CallHistory); 

module.exports = CallHistory;
 