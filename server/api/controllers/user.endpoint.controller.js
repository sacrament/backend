/**
 * User Controller
 * Handles user management endpoints: search, get, update, picture upload, device token
 */

const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const UserService = require('../../services/domain/user/user.service');
const BlockUserModel = mongoose.model('BlockUser');

/**
 * Search Users by Name
 * GET /users?name=query&page=0&size=20
 */
const searchUsers = async (req, res) => {
  try {
    const { name, page = 0, size = 20 } = req.query;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Search name is required'
      });
    }

    const skip = page * size;
    
    // Search for active users with name starting with query (case-insensitive)
    const users = await UserModel.find({
      name: { $regex: `^${name}`, $options: 'i' },
      status: 'ACTIVE'
    })
      .select('name pictureUrl bio')
      .skip(skip)
      .limit(parseInt(size));

    const total = await UserModel.countDocuments({
      name: { $regex: `^${name}`, $options: 'i' },
      status: 'ACTIVE'
    });

    return res.status(200).json({
      status: 'success',
      data: users.map(user => formatUserSearchResponse(user)),
      pagination: {
        page: parseInt(page),
        size: parseInt(size),
        total,
        pages: Math.ceil(total / size)
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to search users'
    });
  }
};

/**
 * Get User Details by ID
 * GET /users/{id}
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.decodedToken?.userId;

    // Authorization: User can only view their own profile from this endpoint
    if (currentUserId !== id) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view this user\'s profile'
      });
    }

    const user = await UserModel.findById(id);

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
    console.error('Get user error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get user'
    });
  }
};

/**
 * Update User Profile
 * PUT /users/{id}
 */
const updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.decodedToken?.userId;
    const { name, email, pictureUrl, isPublic, bio } = req.body;

    // Authorization: User can only update their own profile
    if (currentUserId !== id) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to update this user\'s profile'
      });
    }

    // Validation: isPublic is required
    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isPublic field is required and must be a boolean'
      });
    }

    // Validation: email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    const user = await UserModel.findById(id);
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
    console.error('Update user error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update user profile'
    });
  }
};

/**
 * Upload User Picture
 * PUT /users/{id}/picture
 */
const uploadUserPicture = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.decodedToken?.userId;
    const file = req.file;

    // Authorization
    if (currentUserId !== id) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to update this user\'s picture'
      });
    }

    if (!file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    const user = await UserModel.findById(id);
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
    const pictureUrl = `https://s3.amazonaws.com/winky/users/pictures/${id}_${Date.now()}_${file.originalname}`;

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
    console.error('Upload picture error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload picture'
    });
  }
};

/**
 * Update Device Token
 * PUT /users/{id}/device-token
 */
const updateDeviceToken = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.decodedToken?.userId;
    const { deviceToken, devicePlatform } = req.body;

    // Authorization
    if (currentUserId !== id) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to update this user\'s device token'
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

    const user = await UserModel.findById(id);
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

// ============= Helper Functions =============

/**
 * Format user response for single user
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

/**
 * Format user response for search results
 */
function formatUserSearchResponse(user) {
  return {
    id: user._id?.toString() || user.id,
    name: user.name || '',
    pictureUrl: user.imageUrl || null,
    bio: user.bio || null
  };
}

module.exports = {
  searchUsers,
  getUserById,
  updateUserProfile,
  uploadUserPicture,
  updateDeviceToken
};
