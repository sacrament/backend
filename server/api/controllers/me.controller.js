/**
 * User Profile (Me) Controller
 * Handles authenticated user profile endpoints
 */

const mongoose = require('mongoose');
const UserModel = mongoose.model('User');

/**
 * Get Current User Profile
 * GET /me
 */
const getCurrentUserProfile = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: formatUserResponse(user)
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get user profile'
    });
  }
};

/**
 * Update Current User Profile
 * PUT /me
 */
const updateCurrentUserProfile = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { name, email, pictureUrl, isPublic, bio } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    // Validation: email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    // Validation: isPublic required
    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isPublic field is required and must be a boolean'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (pictureUrl) user.imageUrl = pictureUrl;
    if (bio) user.bio = bio;
    user.isPublic = isPublic;
    user.updatedOn = new Date();

    await user.save();

    return res.status(200).json({
      status: 'success',
      data: formatUserResponse(user)
    });

  } catch (error) {
    console.error('Update current user error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
};

/**
 * Update Current User Picture
 * PUT /me/picture
 */
const updateCurrentUserPicture = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const file = req.file;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    if (!file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // TODO: Upload to AWS S3 using s3.service
    // const s3Service = new S3Service();
    // const url = await s3Service.uploadFile(file, 'users/pictures');

    // For now, use a placeholder
    const pictureUrl = `https://s3.amazonaws.com/winky/users/pictures/${userId}_${Date.now()}_${file.originalname}`;

    // Delete old picture if exists
    if (user.imageUrl) {
      // TODO: Delete from S3
      // await s3Service.deleteFile(user.imageUrl);
    }

    user.imageUrl = pictureUrl;
    await user.save();

    return res.status(200).json({
      status: 'success',
      data: {
        url: pictureUrl
      }
    });

  } catch (error) {
    console.error('Update current user picture error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload picture'
    });
  }
};

/**
 * Update Current User Device Token
 * PUT /me/device-token
 */
const updateCurrentUserDeviceToken = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { deviceToken, devicePlatform } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    // Validation
    if (!deviceToken || deviceToken.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Device token is required'
      });
    }

    if (!devicePlatform || !['ANDROID', 'IOS'].includes(devicePlatform)) {
      return res.status(400).json({
        status: 'error',
        message: 'Device platform must be ANDROID or IOS'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update device info
    user.device = {
      token: deviceToken,
      type: devicePlatform,
      updatedOn: new Date()
    };

    await user.save();

    return res.status(202).json({
      status: 'success',
      message: 'Device token updated'
    });

  } catch (error) {
    console.error('Update device token error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update device token'
    });
  }
};

/**
 * Update Current User Location
 * PUT /me/location
 */
const updateCurrentUserLocation = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { latitude, longitude } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    // Validation
    if (latitude === undefined || latitude === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitude is required'
      });
    }

    if (longitude === undefined || longitude === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Longitude is required'
      });
    }

    // Validate latitude/longitude ranges
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid latitude. Must be between -90 and 90'
      });
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid longitude. Must be between -180 and 180'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update location
    user.location = {
      latitude: lat,
      longitude: lon,
      updatedOn: new Date()
    };

    await user.save();

    return res.status(202).json({
      status: 'success',
      message: 'Location updated'
    });

  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update location'
    });
  }
};

/**
 * Update Radar Visibility Settings
 * POST /me/radar/visibility
 * Sets visibility duration and women-only preference
 */
const updateRadarVisibility = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { duration, womenOnly, show } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update radar settings
    if (typeof show === 'boolean') {
      user.radar.show = show;
    }

    // Set women-only preference (only female users can enable this)
    if (typeof womenOnly === 'boolean') {
      if (womenOnly === true && user.gender !== 'female') {
        return res.status(403).json({
          status: 'error',
          message: 'Women-only visibility can only be enabled by female users'
        });
      }
      user.radar.womenOnly = womenOnly;
    }

    // Set visibility duration (in minutes)
    if (duration) {
      if (duration === 'indefinite' || duration === 0) {
        user.radar.expiresAt = null;
      } else {
        const durationMinutes = parseInt(duration);
        if (isNaN(durationMinutes) || durationMinutes < 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid duration. Must be a positive number or "indefinite"'
          });
        }
        user.radar.expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
      }
    }

    user.radar.updatedOn = new Date();
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Radar visibility updated',
      data: {
        show: user.radar.show,
        womenOnly: user.radar.womenOnly,
        expiresAt: user.radar.expiresAt,
        remainingMinutes: user.radar.expiresAt
          ? Math.max(0, Math.floor((user.radar.expiresAt.getTime() - Date.now()) / 60000))
          : null
      }
    });

  } catch (error) {
    console.error('Update radar visibility error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update radar visibility'
    });
  }
};

/**
 * Disappear Now - Instant hide from radar
 * POST /me/radar/disappear
 */
const disappearFromRadar = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Hide from radar immediately
    user.radar.show = false;
    user.radar.expiresAt = null;
    user.radar.updatedOn = new Date();
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'You are now hidden from radar'
    });

  } catch (error) {
    console.error('Disappear from radar error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to hide from radar'
    });
  }
};

/**
 * Get Radar Status
 * GET /me/radar
 */
const getRadarStatus = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if expired
    let isVisible = user.radar.show;
    if (user.radar.expiresAt && user.radar.expiresAt < new Date()) {
      isVisible = false;
    }

    const remainingMinutes = user.radar.expiresAt && isVisible
      ? Math.max(0, Math.floor((user.radar.expiresAt.getTime() - Date.now()) / 60000))
      : null;

    return res.status(200).json({
      status: 'success',
      data: {
        show: isVisible,
        womenOnly: user.radar.womenOnly || false,
        expiresAt: user.radar.expiresAt,
        remainingMinutes: remainingMinutes
      }
    });

  } catch (error) {
    console.error('Get radar status error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get radar status'
    });
  }
};

/**
 * Delete Current User Account
 * DELETE /me/deleteAccount
 */
const deleteCurrentUserAccount = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Cascade delete: remove associated data
    // TODO: Delete from related collections:
    // - Remove from chat conversations
    // - Delete user's messages
    // - Remove favorite entries
    // - Remove block entries
    // - Delete call history
    // - Delete location history

    // For now, just delete the user
    await UserModel.findByIdAndDelete(userId);

    return res.status(202).json({
      status: 'success',
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete account'
    });
  }
};

// ============= Helper Functions =============

/**
 * Format user response
 */
function formatUserResponse(user) {
  return {
    id: user._id?.toString() || user.id,
    status: user.status || 'ACTIVE',
    name: user.name || '',
    email: user.email || null,
    phone: user.phone || null,
    fbId: user.facebookId || null,
    appleId: user.appleId || null,
    pictureUrl: user.imageUrl || null,
    isPublic: user.isPublic || false,
    bio: user.bio || null,
    chatToken: user.chatToken || null
  };
}

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  updateCurrentUserPicture,
  updateCurrentUserDeviceToken,
  updateCurrentUserLocation,
  updateRadarVisibility,
  disappearFromRadar,
  getRadarStatus,
  deleteCurrentUserAccount
};
