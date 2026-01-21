const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId; 

const User = new Schema({
    id: { type: Number, default: null, index: true },
    name: { type: String, default: null, index: true },
    email: { type: String, default: null, index: true },
    phone: { type: String, default: null, index: true },
    imageUrl: { type: String, default: null },
    bio: { type: String, default: null },
    registeredOn: { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null },
    facebookId: { type: String, default: null },
    lastLogin: { type: Date, default: null },
    status: { type: String, default: null },
    // Gender and age information for women-only visibility feature
    gender: {
        type: String,
        enum: ['male', 'female', 'other', null],
        default: null,
        index: true
    },
    dateOfBirth: { type: Date, default: null },
    // Location for proximity-based discovery
    location: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        updatedOn: { type: Date, default: null }
    },
    device: {
        token: { type: String, default: null },
        voipToken: { type: String, default: null },
        description: { type: String, default: null },
        type: { type: String,  default: null },
        updatedOn: { type: Date, default: null },
        isActive: { type: Boolean, default: true }
    },
    chatToken: { type: String, default: null },
    isPublic: { type: Boolean, default: false },
    refreshToken: { type: String, default: null },
    contacts: [{
        id: { type: String },
        name: { type: String },
        // removed: { type: Boolean },
        removedOn: { type: Date, default: null },
        editedOn: { type: Date, default: null }
    }],
    requests: [{ type: Schema.Types.ObjectId, ref: 'Request'}],
    radar: {
        show: { type: Boolean, default: true },
        updatedOn: { type: Date, default: null },
        // Women-only visibility feature - if true, user only visible to women
        womenOnly: { type: Boolean, default: false },
        // Visibility expiration timestamp for temporary presence
        expiresAt: { type: Date, default: null }
    },
    deleted: {
        date: { type: Date, default: null },
        reason: { type: String, default: "No reason"},
        status: { type: Boolean, default: false }
    }
});

User.index( { phone: "text" } )

mongoose.model('User', User);