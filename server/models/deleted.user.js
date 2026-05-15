const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DeletedUser = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    deletedOn: { type: Date, default: Date.now, index: true },
    reason: { type: String, default: 'User initiated' },
    statusBefore: { type: String, default: null },
    hadDevice: { type: Boolean, default: false },
    devicePlatform: { type: String, default: null },
    registrationDate: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    accountAgeDays: { type: Number, default: null },
    authProvider: {
        apple: { type: Boolean, default: false },
        google: { type: Boolean, default: false },
        phone: { type: Boolean, default: false },
    },
    profileSnapshot: {
        gender: { type: String, default: null },
        age: { type: Number, default: null },
        interestedIn: { type: String, default: null },
    },
}, { timestamps: true });

mongoose.model('DeletedUser', DeletedUser);
