const mongoose = require('mongoose');
const Schema = mongoose.Schema; 

const UserConnectStatus = new Schema({
    // from: { type: Schema.Types.ObjectId, ref: "User" },
    // to: { type: Schema.Types.ObjectId, ref: "User" }, 
    users: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, default: 'unknown', enum: ['connected', 'disconnected', 'unknown']},
    createdOn: { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null }, 
    reason: { type: String, default: null }
});

const userConnect = mongoose.model('UserConnectStatus', UserConnectStatus);

module.exports = {
    UserConnectStatus: userConnect
}