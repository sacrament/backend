const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// One document per platform, same shape as AppVersion. Read by the public
// GET /api/generic/config endpoint on launch/foreground; written only via the
// admin-gated PATCH /api/admin/remote-config/:platform route. Distinct from
// AppVersion — this is app-behavior tunables (feature flags, tab visibility),
// not the force-update gate.
const RemoteConfigSchema = new Schema({
    platform:    { type: String, enum: ['iOS', 'Android'], required: true, unique: true },
    version:     { type: Number, default: 0 },

    isMessageEncryptionEnabled:   { type: Boolean, default: false },
    isHarassmentMonitoringEnabled: { type: Boolean, default: false },

    // Default visibility-timer duration (seconds) seeded for brand-new devices only —
    // never overrides a user's own saved value.
    defaultVisibilityDurationSeconds: { type: Number, default: 1800 },

    // Tab bar / History segment visibility. Empty means "client falls back to its
    // own hardcoded default" — see RemoteConfigData.default on the iOS side.
    visibleTabs:            { type: [String], default: [] },
    visibleHistorySegments: { type: [String], default: [] },

    // Harassment monitor tunables (mirrors HarassmentMonitor / HarassmentMonitorService)
    harassmentFirstMessageCooldownSeconds: { type: Number, default: 60 },
    harassmentMaxWarningsBeforeBan:        { type: Number, default: 3 },
    harassmentClassifierThreshold:         { type: Number, default: 0.85 },

    // Call ring timeout (ActiveCallManager)
    callRingTimeoutSeconds: { type: Number, default: 30 },

    // Video-call kill switch — gates starting/accepting a video call; audio calls
    // are unaffected. Defaults to true (video calls work, same as before this flag).
    isVideoCallsEnabled: { type: Boolean, default: true },

    // Media upload compression (AWSUploadManager)
    imageMaxDimension:            { type: Number, default: 1440 },
    imageJPEGQuality:              { type: Number, default: 0.6 },
    videoReencodeThresholdBytes:   { type: Number, default: 5 * 1024 * 1024 },

    // Radar/nearby discovery-radius presets — an array (not fixed named fields) so
    // presets can be added/removed/reordered without an app update. Single source of
    // truth for the iOS distance picker (NearbyView), this server's own preset
    // resolution (nearby.controller.js), and its proximity-notification default
    // (nearby.notification.service.js) — previously three separate hardcoded copies
    // of the same numbers.
    radarDistancePresets: {
        type: [{
            key:   { type: String, required: true },
            label: { type: String, required: true },
            km:    { type: Number, required: true },
            _id: false
        }],
        default: [
            { key: 'here',     label: 'Closest',  km: 75   * 0.0003048 }, // 75 ft
            { key: 'nearby',   label: 'Nearby',   km: 300  * 0.0003048 }, // 300 ft (default)
            { key: 'walkable', label: 'Walkable', km: 1000 * 0.0003048 }, // 1000 ft
            { key: 'local',    label: 'Area',     km: 0.5  * 1.60934 }    // 0.5 mile
        ]
    }
}, { timestamps: true });

mongoose.model('RemoteConfig', RemoteConfigSchema);
