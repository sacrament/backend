/**
 * Radar distance presets — single source of truth for both the public
 * GET /api/generic/config document (which the iOS distance picker reads) and
 * this server's own preset resolution (nearby.controller.js) and proximity-
 * notification default (nearby.notification.service.js).
 *
 * Cached in-process for a short window: `onLocationUpdate` fires on every
 * location ping, and this shouldn't add a DB round trip to that hot path.
 */

const mongoose = require('mongoose');

const DEFAULT_PRESETS = [
    { key: 'here',     label: 'Closest',  km: 75   * 0.0003048 }, // 75 ft
    { key: 'nearby',   label: 'Nearby',   km: 300  * 0.0003048 }, // 300 ft (default)
    { key: 'walkable', label: 'Walkable', km: 1000 * 0.0003048 }, // 1000 ft
    { key: 'local',    label: 'Area',     km: 0.5  * 1.60934 }    // 0.5 mile
];

const CACHE_TTL_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

/**
 * Returns a { [presetKey]: kilometers } lookup, e.g. `{ here: 0.023, nearby: 0.091, ... }`
 * — built from whatever presets are currently configured, so an admin-added preset
 * (new key, not one of the four defaults) is automatically resolvable too.
 */
async function getRadarDistancePresets(platform = 'iOS') {
    const now = Date.now();
    if (cached && (now - cachedAt) < CACHE_TTL_MS) return cached;

    try {
        const RemoteConfig = mongoose.model('RemoteConfig');
        const doc = await RemoteConfig.findOne({ platform }, 'radarDistancePresets').lean();
        const presets = (doc?.radarDistancePresets?.length ? doc.radarDistancePresets : DEFAULT_PRESETS);

        cached = Object.fromEntries(presets.map(p => [p.key, p.km]));
        cachedAt = now;
    } catch {
        // DB hiccup — serve the last good cache if there is one, else hardcoded defaults.
        if (!cached) cached = Object.fromEntries(DEFAULT_PRESETS.map(p => [p.key, p.km]));
    }

    return cached;
}

module.exports = { getRadarDistancePresets, DEFAULT_PRESETS };
