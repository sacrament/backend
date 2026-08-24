const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * DeletedUser
 *
 * The single record that survives account deletion. Holds no direct identifiers:
 * phone/email/Apple/Google are stored only as keyed HMAC-SHA256 hashes, so the
 * record supports re-registration and ban-evasion checks without retaining a
 * phone number or address.
 *
 * `userId` is kept as a pseudonymous key. The User document it once pointed at no
 * longer exists, so this is deliberately not a populated ref.
 *
 * See docs/SAFETY_REPORTING_AND_ACCOUNT_DELETION_SPEC.md (B3).
 */
const DeletedUser = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },

    // Hashed identifiers — HMAC-SHA256 keyed with OTP_PHONE_HASH_SECRET.
    // phoneHash is a copy of the former user.partition, which is already this hash.
    phoneHash:    { type: String, default: null, index: true },
    emailHash:    { type: String, default: null, index: true },
    appleIdHash:  { type: String, default: null, index: true },
    googleIdHash: { type: String, default: null, index: true },

    deletedOn: { type: Date, default: Date.now, index: true },
    reason:    { type: String, default: 'User initiated' },

    // ─── Statistics ───────────────────────────────────────────────────────────
    // Deliberately coarse. Exact age plus gender plus signup date approaches
    // re-identification, so age is bucketed and location is country-level.
    registeredOn:   { type: Date, default: null },
    lastLogin:      { type: Date, default: null },
    accountAgeDays: { type: Number, default: null },
    devicePlatform: { type: String, default: null },
    country:        { type: String, default: null },

    authProvider: {
        apple:  { type: Boolean, default: false },
        google: { type: Boolean, default: false },
        phone:  { type: Boolean, default: false },
    },

    gender:       { type: String, default: null },
    ageBucket:    { type: String, enum: ['18-24', '25-34', '35-44', '45-54', '55+', null], default: null },
    interestedIn: { type: String, default: null },

    activity: {
        messagesSent:     { type: Number, default: 0 },
        chatsCount:       { type: Number, default: 0 },
        connectionsCount: { type: Number, default: 0 },
        callsCount:       { type: Number, default: 0 },
        reportsFiled:     { type: Number, default: 0 },
        reportsAgainst:   { type: Number, default: 0 },
        timesBlocked:     { type: Number, default: 0 },
        wasBanned:        { type: Boolean, default: false },
    },
}, { timestamps: true });

mongoose.model('DeletedUser', DeletedUser);
