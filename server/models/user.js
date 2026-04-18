const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const User = new Schema({ 
    name: { type: String, default: null, index: true },
    email: { type: String, default: null, index: true },
    // Raw phone number is never stored in plain text.
    // partition  — HMAC-SHA256 keyed hash, used for fast indexed lookups.
    // phone — AES-256-GCM ciphertext, used when the plaintext is needed.
    // sparse: true so the unique constraint ignores Apple/Facebook-only users.
    partition: { type: String, default: null, index: true, unique: true, sparse: true },
    phone: { type: String, default: null },
    imageUrl: { type: String, default: null },
    bio: { type: String, default: null },
    registeredOn: { type: Date, default: Date.now() },
    updatedOn: { type: Date, default: null }, 
    appleId: { type: String, default: null },
    googleId: { type: String, default: null },
    lastLogin: { type: Date, default: null },
    status: { type: String, enum: ['active', 'blocked', 'inactive', null], default: null },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', 'non-binary', 'prefer-not-to-say', null],
        default: null,
        index: true
    },
    age: { type: Number, default: null },
    dateOfBirth: { type: Date, default: null },
    interestedIn: { type: String, enum: ['women', 'men', 'everyone', 'non-binary', null], default: null },
    // Reference to the latest Location document (full history in Location collection)
    location: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    // Active device for push notifications (one per account)
    device: { type: Schema.Types.ObjectId, ref: 'Device', default: null },
    // Favorites: list of user IDs the user has favorited
    favorites: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isPublic: { type: Boolean, default: false },
    refreshToken: { type: String, default: null },
    lastSeen: { type: Date, default: null, index: true },
    radar: {
        enabled:   { type: Boolean, default: true },
        invisible: { type: Boolean, default: false },
        updatedOn: { type: Date, default: null },
    },
    // Visibility preferences (Section 7.1)
    visibilityPreferences: {
        womenOnly: { type: Boolean, default: false },
        menOnly: { type: Boolean, default: false },
        photoBlur: { type: Boolean, default: false }
    },
    // Notification preferences (Section 7.1)
    notificationPreferences: {
        newMessages: { type: Boolean, default: true },
        chatRequests: { type: Boolean, default: true },
        connectionRequests: { type: Boolean, default: true },
        nearbyWinks: { type: Boolean, default: true },
        sound: { type: Boolean, default: true },
        vibration: { type: Boolean, default: true },
        badge: { type: Boolean, default: true }
    },
    // Profile privacy settings (Section 7.2)
    privacySettings: {
        showBio: { type: Boolean, default: true },
        showAge: { type: Boolean, default: true },
        showGender: { type: Boolean, default: true },
        showLocation: { type: Boolean, default: true },
        showContact: { type: Boolean, default: true }
    },
    // Users hidden from radar (won't appear in this user's nearby results)
    hiddenUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Connections hidden from the Winkys/contacts list view
    hiddenConnections: [{
        userId:   { type: Schema.Types.ObjectId, ref: 'User' },
        hiddenAt: { type: Date, default: Date.now }
    }],
    // Timed presence beacon — user broadcasts location for a limited period
    presenceBeacon: {
        latitude:  { type: Number, default: null },
        longitude: { type: Number, default: null },
        expiresAt: { type: Date, default: null },
    },
    deleted: { type: Boolean, default: false },
    deletedOn: { type: Date, default: null },
    deletedReason: { type: String, default: "No reason"}
});


mongoose.model('User', User);
