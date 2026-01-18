const mongoose = require('mongoose');
const Schema = mongoose.Schema; 

const BlockUser = new Schema({
    blocker: { type: Schema.Types.ObjectId, ref: "User" },
    blockedOriginalId: { type: Number },
    blocked : { type: Schema.Types.ObjectId, ref: "User" }, 
    reason: { type: String, index: true },
    description: { type: String, default: null },
    status: { type: String }, 
    createdOn: { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null }
});

mongoose.model('BlockUser', BlockUser);