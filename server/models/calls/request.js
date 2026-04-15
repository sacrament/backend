const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CallRequest = new Schema({
    requestId: { type: String, required: true, index: true, unique: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat', default: null, index: true },
    mode: { type: String, enum: ['audio', 'video'], default: 'audio' },
    response: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled', 'disabled'], default: 'pending', index: true },
    respondedOn: { type: Date, default: Date.now, index: true },
    ipAddress: { type: String, default: null },
    networkInfo: { type: String, default: null },
    consumedOn: { type: Date, default: null, index: true },
}, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

CallRequest.index({ from: 1, to: 1, response: 1, createdOn: -1 });

mongoose.model('CallRequest', CallRequest);

module.exports = CallRequest;