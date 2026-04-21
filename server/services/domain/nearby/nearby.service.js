const mongoose = require('mongoose');

class NearbyService {
    get _User()     { return mongoose.model('User'); }
    get _Location() { return mongoose.model('Location'); }
    get _BlockUser() { return mongoose.model('BlockUser'); }
    get _Log() { return mongoose.model('NearbyUsersLog'); }

    /**
     * Find users whose current location is within radiusKm.
     *
     * Queries the Location collection (which has the 2dsphere index) to find
     * nearby location docs, then matches Users whose `location` ref (latest
     * location) is in that set — ensuring only users currently in range match.
     * Results are populated with their location doc for coordinate access.
     *
     * @param {number} lon
     * @param {number} lat
     * @param {number} radiusKm
     * @param {Object} extraFilters  Additional User match conditions
     */
    async findUsersNear(lon, lat, radiusKm, extraFilters = {}) {
        const userMatch = {};
        for (const [key, val] of Object.entries(extraFilters)) {
            userMatch[`user.${key}`] = val;
        }

        // console.log('[NearbyService] findUsersNear', { lon, lat, radiusKm, userMatch });

        const results = await this._Location.aggregate([
            {
                $geoNear: {
                    near: { type: 'Point', coordinates: [lon, lat] },
                    distanceField: 'dist',
                    maxDistance: radiusKm * 1000,
                    spherical: true,
                    query: { isCurrent: true },
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: 'location',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: userMatch },
            { 
                $replaceRoot: {
                    newRoot: {
                        $mergeObjects: [
                            '$user',
                            {
                                latitude: { $arrayElemAt: ['$point.coordinates', 1] },
                                longitude: { $arrayElemAt: ['$point.coordinates', 0] },
                                distanceKm: { $divide: ['$dist', 1000] }
                            }
                        ]
                    }
                }
            }
        ]);

        // console.log('[NearbyService] results count:', results.length, results.map(r => ({ id: r._id, name: r.name })));
        return results;
    }

    /**
     * Get the set of user IDs that are blocked by or have blocked the given user.
     */
    async getBlockedUserIds(currentUserId) {
        const records = await this._BlockUser.find({
            $or: [{ blocker: currentUserId }, { blocked: currentUserId }]
        });

        const ids = new Set();
        for (const r of records) {
            if (r.blocker.toString() === currentUserId.toString()) ids.add(r.blocked.toString());
            if (r.blocked.toString() === currentUserId.toString()) ids.add(r.blocker.toString());
        }
        return ids;
    }

    /**
     * Log nearby encounters for the current user.
     */
    async logEncounters(currentUserId, nearbyUsers, lat, lon) {
        const promises = nearbyUsers.map(u =>
            this._Log.create({
                userId: currentUserId,
                nearbyUserId: u.id,
                latitude: lat,
                longitude: lon,
                distance: u.distance,
                timestamp: new Date()
            }).catch(err => console.error('Error logging nearby user:', err))
        );
        await Promise.all(promises);
    }

    /**
     * Get distinct users the current user has encountered, with their details.
     */
    async getHistory(currentUserId) {
        const ids = await this._Log.distinct('nearbyUserId', { userId: currentUserId });
        return this._User.find({ _id: { $in: ids }, status: 'active' })
            .select('_id name imageUrl bio gender');
    }

    /**
     * Get all logged encounters between the current user and a specific user.
     */
    async getEncountersWith(currentUserId, targetUserId) {
        return this._Log.find({ userId: currentUserId, nearbyUserId: targetUserId })
            .sort({ timestamp: -1 });
    }

    /**
     * Delete all encounter history between the current user and a specific user.
     */
    async deleteHistory(currentUserId, targetUserId) {
        await this._Log.deleteMany({ userId: currentUserId, nearbyUserId: targetUserId });
    }

    /**
     * Get a user by _id with their latest location populated.
     */
    async getUserById(userId) {
        return this._User.findById(userId).populate('location', 'point recordedAt');
    }
}

module.exports = NearbyService;
