// Nearby Users Controller

const NearbyService = require('../../services/domain/nearby/nearby.service');
const nearbyService = new NearbyService();

const DISTANCE_PRESETS = {
    'here':     75   * 0.0003048,  // 75 feet → km
    'nearby':   300  * 0.0003048,  // 300 feet → km (default)
    'walkable': 1000 * 0.0003048,  // 1000 feet → km
    'local':    0.5  * 1.60934     // 0.5 miles → km
};

/**
 * GET /users-nearby
 */
const getNearbyUsers = async (req, res) => {
    try {
        const currentUserId = req.decodedToken.userId;
        const { radius, unit = 'km', preset } = req.query;

        console.log(`[getNearbyUsers] Request - userId: ${currentUserId}, preset: ${preset}, radius: ${radius}, unit: ${unit}`);

        const currentUser = await nearbyService.getUserById(currentUserId);
        if (!currentUser) {
            console.warn(`[getNearbyUsers] User not found - userId: ${currentUserId}`);
            return res.status(404).json({ status: 'error', message: 'User not found', code: 4001 });
        }

        const coords = currentUser.location?.point?.coordinates;

        if (!coords || coords.length < 2) {
            console.warn(`[getNearbyUsers] No location data for userId: ${currentUserId}`);
            return res.status(200).json({ status: 'success', data: [], message: 'User has no location data. Please update location first.' });
        }

        const [searchLon, searchLat] = coords;

        // Resolve radius in km
        let radiusInKm;
        if (preset && DISTANCE_PRESETS[preset]) {
            radiusInKm = DISTANCE_PRESETS[preset];
        } else if (radius && !isNaN(parseFloat(radius))) {
            const r = parseFloat(radius);
            radiusInKm = unit === 'mile' ? r * 1.60934 : unit === 'feet' ? r * 0.0003048 : r;
        } else {
            radiusInKm = DISTANCE_PRESETS['nearby'];
        }

        console.log(`[getNearbyUsers] Search params - userId: ${currentUserId}, lat: ${searchLat}, lon: ${searchLon}, radiusKm: ${radiusInKm}, interestedIn: ${currentUser.interestedIn}`);

        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

        const filters = {
            _id: { $ne: currentUserId },
            status: 'active',
            'radar.enabled': { $ne: false },
            'radar.invisible': { $ne: true },
            lastSeen: { $gt: twoMinutesAgo },
        };

        // Filter by what the current user wants to see
        if (currentUser.interestedIn === 'women') {
            filters.gender = 'female';
        } else if (currentUser.interestedIn === 'men') {
            filters.gender = 'male';
        } else if (currentUser.interestedIn === 'both') {
            filters.gender = { $in: ['male', 'female'] };
        }

        const [rawUsers, blockedIds] = await Promise.all([
            nearbyService.findUsersNear(searchLon, searchLat, radiusInKm, filters),
            nearbyService.getBlockedUserIds(currentUserId)
        ]);

        console.log(`[getNearbyUsers] Found ${rawUsers.length} raw users, ${blockedIds.size} blocked - userId: ${currentUserId}`);

        const currentGender = currentUser.gender; // 'male' | 'female' | 'other' | null

        const response = rawUsers
            .filter(u => !blockedIds.has(u._id.toString()))
            // Respect each user's visibility preferences:
            // womenOnly=true  → only female viewers can see this user
            // menOnly=true    → only male viewers can see this user
            .filter(u => {
                const prefs = u.visibilityPreferences || {};
                if (prefs.womenOnly && currentGender !== 'female') return false;
                if (prefs.menOnly   && currentGender !== 'male')   return false;
                return true;
            })
            .map(u => {
                const distanceKm = u.distanceKm;

                let visibilityRemaining = null;

                const privacy = u.privacySettings || {};

                return {
                    id: u._id,
                    name: u.name,
                    imageUrl: u.imageUrl,
                    bio: privacy.showBio !== false ? u.bio : null,
                    age: privacy.showAge !== false ? u.age : null,
                    gender: privacy.showGender !== false ? u.gender : null,
                    distance: privacy.showLocation !== false ? parseFloat(distanceKm.toFixed(3)) : null,
                    distanceUnit: 'km',
                    visibilityRemaining,
                    locationUpdatedAt: privacy.showLocation !== false ? u.updatedOn : null
                };
            })
            .sort((a, b) => a.distance - b.distance);

        console.log(`[getNearbyUsers] Returning ${response.length} users after filters - userId: ${currentUserId}`);

        // await nearbyService.logEncounters(currentUserId, response, searchLat, searchLon);

        res.status(200).json({
            status: 'success',
            data: response,
            meta: { radiusKm: radiusInKm, preset: preset || 'custom', count: response.length }
        });

    } catch (error) {
        console.error(`[getNearbyUsers] Unexpected error:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to get nearby users', code: 5000, error: error.message });
    }
};

/**
 * GET /users-nearby/history/users
 */
const getNearbyUsersHistory = async (req, res) => {
    try {
        const currentUserId = req.decodedToken.userId; 

        const currentUser = await nearbyService.getUserById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ status: 'error', message: 'User not found', code: 4001 });
        }

        const users = await nearbyService.getHistory(currentUserId);

        res.status(200).json({
            status: 'success',
            data: users.map(u => ({ id: u._id, name: u.name, imageUrl: u.imageUrl, bio: u.bio, gender: u.gender }))
        });

    } catch (error) {
        console.error('Error getting nearby users history:', error);
        res.status(500).json({ status: 'error', message: 'Failed to get nearby users history', code: 5000 });
    }
};

/**
 * GET /users-nearby/history/users/:userId
 */
const getNearbyUserSpecificHistory = async (req, res) => {
    try {
        const currentUserId = req.decodedToken.userId;
        const { userId } = req.params;
 
        const targetUser = await nearbyService.getUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ status: 'error', message: 'User not found', code: 4001 });
        }

        if (targetUser.status !== 'active') {
            return res.status(404).json({ status: 'error', message: 'User is not active', code: 4001 });
        }

        const encounters = await nearbyService.getEncountersWith(currentUserId, userId);

        res.status(200).json({
            status: 'success',
            data: encounters.map(e => ({
                id: targetUser._id,
                name: targetUser.name,
                imageUrl: targetUser.imageUrl,
                bio: targetUser.bio,
                gender: targetUser.gender,
                latitude: e.latitude,
                longitude: e.longitude,
                distance: e.distance,
                locationReportedTime: e.timestamp
            }))
        });

    } catch (error) {
        console.error('Error getting specific nearby user history:', error);
        res.status(500).json({ status: 'error', message: 'Failed to get nearby user history', code: 5000 });
    }
};

/**
 * DELETE /users-nearby/history/users/:userId
 */
const deleteNearbyUserHistory = async (req, res) => {
    try {
        const currentUserId = req.decodedToken.userId;
        const { userId } = req.params;
 
        const targetUser = await nearbyService.getUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ status: 'error', message: 'User not found', code: 4001 });
        }

        await nearbyService.deleteHistory(currentUserId, userId);

        res.status(204).send();

    } catch (error) {
        console.error('Error deleting nearby user history:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete nearby user history', code: 5000 });
    }
};

/**
 * GET /users-nearby/presets
 */
const getDistancePresets = async (req, res) => {
    try {
        res.status(200).json({
            status: 'success',
            data: {
                here:     { distance: 75,   unit: 'feet',  label: 'Here' },
                nearby:   { distance: 300,  unit: 'feet',  label: 'Nearby', default: true },
                walkable: { distance: 1000, unit: 'feet',  label: 'Walkable' },
                local:    { distance: 0.5,  unit: 'mile',  label: 'Local' }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to get distance presets', code: 5000 });
    }
};

module.exports = { getNearbyUsers, getNearbyUsersHistory, getNearbyUserSpecificHistory, deleteNearbyUserHistory, getDistancePresets, DISTANCE_PRESETS };
