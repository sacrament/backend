const mongoose = require('mongoose');
const Schema = mongoose.Schema; 

const UserRequest = new Schema({
    from: { type: Schema.Types.ObjectId, ref: "User", index: true },
    to: { type: Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, default: 'new', enum: ['new', 'accepted', 'declined', 'cancelled', 'disconnected']},
    createdOn: { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null },
    // acceptedOn: { type: Date, default: null },
    // cancelledOn: { type: Date, default: null },
    // declinedOn: { type: Date, default: null },
    reason: { type: String, default: null },  
    howMany: { type: Number, default: 1 }
});

const userRequest = mongoose.model('UserRequest', UserRequest);

module.exports = {
    UserRequest: userRequest
}