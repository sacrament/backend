const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SavedUser = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    savedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdOn: { type: Date, default: Date.now },
}, {
    versionKey: false,
});

SavedUser.index({ user: 1, savedUser: 1 }, { unique: true });

const savedUser = mongoose.model('SavedUser', SavedUser);

module.exports = {
    SavedUser: savedUser
};
