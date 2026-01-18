// Nearby Users Controller
// Handles endpoints for finding and managing nearby users

const User = require('../../models/user');
const NearbyUsersLog = require('../../models/nearby.users.log');

/**
 * Get nearby users within specified radius
 * GET /users-nearby
 * Query params: radius (required), unit (optional, default: kilometer)
 */
const getNearbyUsers = async (req, res) => {
  try {
    const currentUserId = req.decodedToken.userId;
    const { radius, unit = 'kilometer' } = req.query;

    // Validate radius
    if (!radius || isNaN(parseFloat(radius))) {
      return res.status(400).json({
        status: 'error',
        message: 'Radius is required and must be a valid number',
        code: 2001
      });
    }

    // Get current user's last location
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.latitude || !currentUser.longitude) {
      return res.status(200).json({
        status: 'success',
        data: [],
        message: 'User has no location'
      });
    }

    // Convert radius to kilometers
    const radiusInKm = unit === 'mile' ? parseFloat(radius) * 1.60934 : parseFloat(radius);

    // Calculate bounding box for efficient query
    const latDelta = radiusInKm / 111; // 1 degree latitude ≈ 111 km
    const lngDelta = radiusInKm / (111 * Math.cos(currentUser.latitude * Math.PI / 180));

    const minLat = currentUser.latitude - latDelta;
    const maxLat = currentUser.latitude + latDelta;
    const minLng = currentUser.longitude - lngDelta;
    const maxLng = currentUser.longitude + lngDelta;

    // Query nearby users
    const nearbyUsers = await User.find({
      _id: { $ne: currentUserId },
      latitude: { $gte: minLat, $lte: maxLat },
      longitude: { $gte: minLng, $lte: maxLng },
      status: 'ACTIVE'
    });

    // Filter blocked users
    const userBlockedList = currentUser.blockedUsers || [];
    const userBlockedByList = await User.find({ blockedUsers: currentUserId }).select('_id');
    const blockedByIds = userBlockedByList.map(u => u._id.toString());

    // Calculate distance and format response
    const response = nearbyUsers
      .filter(user => !userBlockedList.includes(user._id.toString()) && !blockedByIds.includes(user._id.toString()))
      .map(user => {
        const lat1 = currentUser.latitude * Math.PI / 180;
        const lat2 = user.latitude * Math.PI / 180;
        const deltaLat = (user.latitude - currentUser.latitude) * Math.PI / 180;
        const deltaLng = (user.longitude - currentUser.longitude) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = 6371 * c; // Earth radius in km

        return {
          id: user._id,
          name: user.name,
          pictureUrl: user.pictureUrl,
          bio: user.bio,
          latitude: user.latitude,
          longitude: user.longitude,
          distance: parseFloat(distance.toFixed(2)),
          locationReportedTime: user.lastLocationUpdatedAt || user.createdAt
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // Log nearby user encounters
    for (const nearbyUser of response) {
      await NearbyUsersLog.create({
        userId: currentUserId,
        nearbyUserId: nearbyUser.id,
        latitude: nearbyUser.latitude,
        longitude: nearbyUser.longitude,
        distance: nearbyUser.distance,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (error) {
    console.error('Error getting nearby users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby users',
      code: 5000
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
    }).select('_id name pictureUrl bio');

    const response = nearbyUsers.map(user => ({
      id: user._id,
      name: user.name,
      pictureUrl: user.pictureUrl,
      bio: user.bio
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
      pictureUrl: targetUser.pictureUrl,
      bio: targetUser.bio,
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

module.exports = {
  getNearbyUsers,
  getNearbyUsersHistory,
  getNearbyUserSpecificHistory,
  deleteNearbyUserHistory
};
