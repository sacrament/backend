// Nearby Users Controller
// Handles endpoints for finding and managing nearby users

const mongoose = require('mongoose');
const User = mongoose.model('User');
const BlockUser = mongoose.model('BlockUser');
const NearbyUsersLog = mongoose.model('NearbyUsersLog');

/**
 * Distance presets as per PDF requirements
 * Converting all to kilometers for internal calculations
 */
const DISTANCE_PRESETS = {
  'here': 75 * 0.0003048, // 75 feet to km
  'nearby': 300 * 0.0003048, // 300 feet to km (default)
  'walkable': 1000 * 0.0003048, // 1000 feet to km
  'local': 0.5 * 1.60934 // 0.5 miles to km
};

/**
 * Get nearby users within specified radius
 * GET /users-nearby
 * Query params:
 *   - radius (optional, uses preset or numeric value)
 *   - unit (optional: 'kilometer', 'mile', 'feet', default: kilometer)
 *   - preset (optional: 'here', 'nearby', 'walkable', 'local')
 */
const getNearbyUsers = async (req, res) => {
  try {
    const currentUserId = req.decodedToken.userId;
    const { radius, unit = 'kilometer', preset } = req.query;

    // Get current user
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        code: 4001
      });
    }

    // Check if user has location data
    if (!currentUser.location || !currentUser.location.latitude || !currentUser.location.longitude) {
      return res.status(200).json({
        status: 'success',
        data: [],
        message: 'User has no location data. Please update location first.'
      });
    }

    // Determine radius in kilometers
    let radiusInKm;

    if (preset && DISTANCE_PRESETS[preset]) {
      // Use preset distance
      radiusInKm = DISTANCE_PRESETS[preset];
    } else if (radius && !isNaN(parseFloat(radius))) {
      // Use provided radius and convert to km
      const radiusNum = parseFloat(radius);
      if (unit === 'mile') {
        radiusInKm = radiusNum * 1.60934;
      } else if (unit === 'feet') {
        radiusInKm = radiusNum * 0.0003048;
      } else {
        radiusInKm = radiusNum;
      }
    } else {
      // Default to 'nearby' preset (300 feet)
      radiusInKm = DISTANCE_PRESETS['nearby'];
    }

    // Calculate bounding box for efficient query
    const latDelta = radiusInKm / 111; // 1 degree latitude ≈ 111 km
    const lngDelta = radiusInKm / (111 * Math.cos(currentUser.location.latitude * Math.PI / 180));

    const minLat = currentUser.location.latitude - latDelta;
    const maxLat = currentUser.location.latitude + latDelta;
    const minLng = currentUser.location.longitude - lngDelta;
    const maxLng = currentUser.location.longitude + lngDelta;

    // Build query for nearby users
    const query = {
      _id: { $ne: currentUserId },
      'location.latitude': { $gte: minLat, $lte: maxLat },
      'location.longitude': { $gte: minLng, $lte: maxLng },
      status: 'ACTIVE',
      'radar.show': true // Only show users who are visible on radar
    };

    // Check for expired radar visibility
    const now = new Date();
    query.$or = [
      { 'radar.expiresAt': null }, // No expiration set
      { 'radar.expiresAt': { $gt: now } } // Not expired yet
    ];

    // Women-only visibility filtering
    // If a female user has womenOnly enabled, they should only be visible to women
    if (currentUser.gender === 'male' || currentUser.gender === 'other' || !currentUser.gender) {
      // Non-female users should NOT see users with womenOnly enabled
      query['radar.womenOnly'] = { $ne: true };
    }
    // If currentUser is female, they can see everyone (both womenOnly and regular users)

    const nearbyUsers = await User.find(query);

    // Get blocked users and users who blocked current user
    const blockRecords = await BlockUser.find({
      $or: [
        { blocker: currentUserId },
        { blocked: currentUserId }
      ]
    });

    const blockedUserIds = new Set();
    blockRecords.forEach(record => {
      if (record.blocker.toString() === currentUserId.toString()) {
        blockedUserIds.add(record.blocked.toString());
      }
      if (record.blocked.toString() === currentUserId.toString()) {
        blockedUserIds.add(record.blocker.toString());
      }
    });

    // Calculate distance using Haversine formula and format response
    const response = nearbyUsers
      .filter(user => !blockedUserIds.has(user._id.toString()))
      .map(user => {
        const lat1 = currentUser.location.latitude * Math.PI / 180;
        const lat2 = user.location.latitude * Math.PI / 180;
        const deltaLat = (user.location.latitude - currentUser.location.latitude) * Math.PI / 180;
        const deltaLng = (user.location.longitude - currentUser.location.longitude) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = 6371 * c; // Earth radius in km

        // Calculate visibility duration if expiration is set
        let visibilityRemaining = null;
        if (user.radar.expiresAt) {
          const remainingMs = user.radar.expiresAt.getTime() - now.getTime();
          visibilityRemaining = Math.max(0, Math.floor(remainingMs / 60000)); // minutes
        }

        return {
          id: user._id,
          name: user.name,
          imageUrl: user.imageUrl,
          bio: user.bio,
          gender: user.gender,
          distance: parseFloat(distanceKm.toFixed(3)),
          distanceUnit: 'km',
          visibilityRemaining: visibilityRemaining, // minutes until user disappears
          locationUpdatedAt: user.location.updatedOn || user.updatedOn
        };
      })
      .filter(user => user.distance <= radiusInKm) // Final distance check
      .sort((a, b) => a.distance - b.distance);

    // Log nearby user encounters
    const logPromises = response.map(nearbyUser =>
      NearbyUsersLog.create({
        userId: currentUserId,
        nearbyUserId: nearbyUser.id,
        latitude: currentUser.location.latitude,
        longitude: currentUser.location.longitude,
        distance: nearbyUser.distance,
        timestamp: new Date()
      }).catch(err => console.error('Error logging nearby user:', err))
    );

    await Promise.all(logPromises);

    res.status(200).json({
      status: 'success',
      data: response,
      meta: {
        radiusKm: radiusInKm,
        preset: preset || 'custom',
        count: response.length
      }
    });
  } catch (error) {
    console.error('Error getting nearby users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby users',
      code: 5000,
      error: error.message
    });
  }
};

/**
 * Get all nearby users history (distinct users encountered)
 * GET /users-nearby/history/users
 */
const getNearbyUsersHistory = async (req, res) => {
  try {
    const currentUserId = req.decodedToken.userId;

    // Get current user
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        code: 4001
      });
    }

    // Get distinct nearby users from history
    const historyEntries = await NearbyUsersLog.distinct('nearbyUserId', {
      userId: currentUserId
    });

    // Get user details for each history entry
    const nearbyUsers = await User.find({
      _id: { $in: historyEntries },
      status: 'ACTIVE'
    }).select('_id name imageUrl bio gender');

    const response = nearbyUsers.map(user => ({
      id: user._id,
      name: user.name,
      imageUrl: user.imageUrl,
      bio: user.bio,
      gender: user.gender
    }));

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (error) {
    console.error('Error getting nearby users history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby users history',
      code: 5000
    });
  }
};

/**
 * Get specific nearby user history
 * GET /users-nearby/history/users/{userId}
 */
const getNearbyUserSpecificHistory = async (req, res) => {
  try {
    const currentUserId = req.decodedToken.userId;
    const { userId } = req.params;

    // Validate target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        code: 4001
      });
    }

    if (targetUser.status !== 'ACTIVE') {
      return res.status(404).json({
        status: 'error',
        message: 'User is not active',
        code: 4001
      });
    }

    // Get all encounters with specific user
    const encounters = await NearbyUsersLog.find({
      userId: currentUserId,
      nearbyUserId: userId
    }).sort({ timestamp: -1 });

    const response = encounters.map(encounter => ({
      id: targetUser._id,
      name: targetUser.name,
      imageUrl: targetUser.imageUrl,
      bio: targetUser.bio,
      gender: targetUser.gender,
      latitude: encounter.latitude,
      longitude: encounter.longitude,
      distance: encounter.distance,
      locationReportedTime: encounter.timestamp
    }));

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (error) {
    console.error('Error getting specific nearby user history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby user history',
      code: 5000
    });
  }
};

/**
 * Delete nearby user history
 * DELETE /users-nearby/history/users/{userId}
 */
const deleteNearbyUserHistory = async (req, res) => {
  try {
    const currentUserId = req.decodedToken.userId;
    const { userId } = req.params;

    // Validate target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        code: 4001
      });
    }

    // Delete history entries between current user and target user
    await NearbyUsersLog.deleteMany({
      userId: currentUserId,
      nearbyUserId: userId
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting nearby user history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete nearby user history',
      code: 5000
    });
  }
};

/**
 * Get available distance presets
 * GET /users-nearby/presets
 */
const getDistancePresets = async (req, res) => {
  try {
    const presets = {
      here: {
        distance: 75,
        unit: 'feet',
        label: 'Here'
      },
      nearby: {
        distance: 300,
        unit: 'feet',
        label: 'Nearby',
        default: true
      },
      walkable: {
        distance: 1000,
        unit: 'feet',
        label: 'Walkable'
      },
      local: {
        distance: 0.5,
        unit: 'mile',
        label: 'Local'
      }
    };

    res.status(200).json({
      status: 'success',
      data: presets
    });
  } catch (error) {
    console.error('Error getting distance presets:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get distance presets',
      code: 5000
    });
  }
};

module.exports = {
  getNearbyUsers,
  getNearbyUsersHistory,
  getNearbyUserSpecificHistory,
  deleteNearbyUserHistory,
  getDistancePresets,
  DISTANCE_PRESETS
};
