const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// One document per platform. Read by the public GET /api/generic/appVersion
// endpoint on every launch/foreground; written only via the admin-gated
// PATCH /api/app-version/:platform route.
const AppVersionSchema = new Schema({
    platform:            { type: String, enum: ['iOS', 'Android'], required: true, unique: true },
    minSupportedVersion: { type: String, required: true },
    latestVersion:       { type: String, required: true },
    // Emergency kill switch — forces every client below this doc's platform
    // to update regardless of the version compare, e.g. a critical bug found
    // in a build that's already "latest". Off by default.
    forceUpdate:         { type: Boolean, default: false },
    updateMessage:       { type: String, default: null },
    appStoreId:          { type: String, default: null }
}, { timestamps: true });

mongoose.model('AppVersion', AppVersionSchema);
