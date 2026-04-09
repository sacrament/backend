/**
 * Me Controller
 * All endpoints for the authenticated user's own profile.
 * verifyToken is applied at the router level — not repeated here.
 */

const crypto        = require('crypto');
const mongoose      = require('mongoose');
const UserService   = require('../../services/domain/user/user.service');
const DeviceService = require('../../services/domain/device/device.service');
const KeyEscrow     = require('../../models/key.escrow');
const userService   = new UserService();
const deviceService = new DeviceService();
const logger        = require('../../utils/logger');

/**
 * GET /me
 */
const getCurrentUserProfile = async (req, res) => {
  try {
    const user = await userService.getUserById(req.decodedToken.userId);

    if (!user || user.deleted) {
      return res.status(404).json({ status: 'error', code: 'ACCOUNT_DELETED', message: 'Account no longer exists' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ status: 'error', code: 'ACCOUNT_BANNED', message: 'Account has been suspended' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ status: 'error', code: 'ACCOUNT_INACTIVE', message: 'Account is inactive' });
    }

    return res.status(200).json({ status: 'success', user: formatUserResponse(user) });
  } catch (error) {
    logger.error('Get current user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get user profile' });
  }
};

/**
 * PATCH /me/setup
 * Onboarding profile setup (A.5 in the auth flow).
 * Accepts any combination of: name, dateOfBirth, gender, imageUrl,
 * latitude + longitude, and a device object to register the device.
 */
const setupProfile = async (req, res) => {
  try {
    const userId = req.decodedToken.userId;
    const { name, dateOfBirth, gender, imageUrl, latitude, longitude, deviceId } = req.body;

    const profileUpdates = {};

    if (name !== undefined)      profileUpdates.name = name;
    if (imageUrl !== undefined)  profileUpdates.imageUrl = imageUrl;

    if (dateOfBirth !== undefined) {
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid dateOfBirth' });
      }
      profileUpdates.dateOfBirth = dob;
    }

    if (gender !== undefined) {
      if (!['male', 'female', 'other'].includes(gender)) {
        return res.status(400).json({ status: 'error', message: 'gender must be male, female, or other' });
      }
      profileUpdates.gender = gender;
    }

    if (Object.keys(profileUpdates).length > 0) {
      await userService.updateProfile(userId, profileUpdates);
    }

    if (deviceId) {
      await deviceService.linkToUser(deviceId, userId);
    }

    if (latitude !== undefined && longitude !== undefined) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      if (isNaN(lat) || lat < -90  || lat > 90)  return res.status(400).json({ status: 'error', message: 'Invalid latitude' });
      if (isNaN(lon) || lon < -180 || lon > 180) return res.status(400).json({ status: 'error', message: 'Invalid longitude' });
      await userService.updateLocation(userId, lat, lon);
    }

    const user = await userService.getUserById(userId);
    return res.status(200).json({ status: 'success', user: formatUserResponse(user) });

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    logger.error('Profile setup error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to setup profile' });
  }
};

/**
 * PUT /me
 */
const updateCurrentUserProfile = async (req, res) => {
  try {
    // Accept both field name variants from the spec
    const {
      name, bio, email, isPublic, interestedIn, gender,
      imageUrl, pictureUrl,           // either alias accepted
      dateOfBirth, birthday,          // either alias accepted
      age,
    } = req.body;

    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: 'error', message: 'Invalid email format' });
    }
    if (gender !== undefined && !['male', 'female', 'other', 'none'].includes(gender)) {
      return res.status(400).json({ status: 'error', message: 'gender must be male, female, other, or none' });
    }
    if (interestedIn !== undefined && !['women', 'men', 'both'].includes(interestedIn)) {
      return res.status(400).json({ status: 'error', message: 'interestedIn must be women, men, or both' });
    }

    const fields = {};
    if (name         !== undefined) fields.name        = name;
    if (bio          !== undefined) fields.bio         = bio;
    if (email        !== undefined) fields.email       = email;
    if (isPublic     !== undefined) fields.isPublic    = isPublic;
    if (interestedIn !== undefined) fields.interestedIn = interestedIn;
    if (gender       !== undefined) fields.gender      = gender;
    if (age          !== undefined) fields.age         = age;
    // pictureUrl / imageUrl are interchangeable
    const photo = pictureUrl ?? imageUrl;
    if (photo !== undefined) fields.imageUrl = photo;
    // birthday / dateOfBirth are interchangeable
    const dob = birthday ?? dateOfBirth;
    if (dob !== undefined) fields.dateOfBirth = dob;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No fields provided to update' });
    }

    const user = await userService.updateProfile(req.decodedToken.userId, fields);
    return res.status(200).json({ status: 'success', user: formatUserResponse(user) });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ status: 'error', message: 'User not found' });
    logger.error('Update current user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update profile' });
  }
};

/**
 * PUT /me/picture
 */
const updateCurrentUserPicture = async (req, res) => {
  try {
    const { userId } = req.decodedToken;
    const file = req.file;

    if (!file) return res.status(400).json({ status: 'error', message: 'No file provided' });

    const pictureUrl = file.location
      || `https://s3.amazonaws.com/winky/users/pictures/${userId}_${Date.now()}_${file.originalname}`;

    await userService.updatePicture(userId, pictureUrl);
    return res.status(200).json({ status: 'success', url: pictureUrl });

  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ status: 'error', message: 'User not found' });
    logger.error('Update picture error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to upload picture' });
  }
};

/**
 * PUT /me/location
 */
const updateCurrentUserLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || latitude === null)  return res.status(400).json({ status: 'error', message: 'Latitude is required' });
    if (longitude === undefined || longitude === null) return res.status(400).json({ status: 'error', message: 'Longitude is required' });

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90  || lat > 90)  return res.status(400).json({ status: 'error', message: 'Invalid latitude. Must be between -90 and 90' });
    if (isNaN(lon) || lon < -180 || lon > 180) return res.status(400).json({ status: 'error', message: 'Invalid longitude. Must be between -180 and 180' });

    await userService.updateLocation(req.decodedToken.userId, lat, lon);
    return res.status(202).json({ status: 'success', message: 'Location updated' });

  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ status: 'error', message: 'User not found' });
    logger.error('Update location error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update location' });
  }
};

/**
 * PUT /me/presence
 */
const updatePresence = async (req, res) => {
  try {
    const user = await userService.updatePresence(req.decodedToken.userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    return res.status(200).json({ status: 'success', lastSeen: user.lastSeen });
  } catch (error) {
    logger.error('Update presence error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update presence' });
  }
};

/**
 * PUT /me/radar
 */
const updateRadarStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'status must be a boolean' });
    }
    const user = await userService.updateRadarEnabled(req.decodedToken.userId, status);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    return res.status(200).json({ status: 'success', user: formatUserResponse(user) });
  } catch (error) {
    logger.error('Update radar error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update radar' });
  }
};

/**
 * PUT /me/radar/invisible
 */
const updateRadarInvisible = async (req, res) => {
  try {
    const { invisible } = req.body;
    if (typeof invisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'invisible must be a boolean' });
    }
    const user = await userService.updateRadarInvisible(req.decodedToken.userId, invisible);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    return res.status(200).json({ status: 'success', user: formatUserResponse(user) });
  } catch (error) {
    logger.error('Update radar invisible error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update radar' });
  }
};

/**
 * PUT /me/notifications/preferences
 */
const updateNotificationPreferences = async (req, res) => {
  try {
    const notificationPreferences = await userService.updateNotificationPreferences(req.decodedToken.userId, req.body);
    return res.status(200).json({ status: 'success', notificationPreferences });
  } catch (error) {
    logger.error('Update notification preferences error:', error);
    const status = error.message === 'User not found' ? 404 : 500;
    return res.status(status).json({ status: 'error', message: error.message });
  }
};

/**
 * PUT /me/visibility/preferences
 */
const updateVisibilityPreferences = async (req, res) => {
  try {
    const visibilityPreferences = await userService.updateVisibilityPreferences(req.decodedToken.userId, req.body);
    return res.status(200).json({ status: 'success', visibilityPreferences });
  } catch (error) {
    logger.error('Update visibility preferences error:', error);
    const status = error.message === 'User not found' ? 404 : 500;
    return res.status(status).json({ status: 'error', message: error.message });
  }
};

/**
 * PUT /me/privacy
 */
const updateProfilePrivacy = async (req, res) => {
  try {
    const privacySettings = await userService.updateProfilePrivacy(req.decodedToken.userId, req.body);
    return res.status(200).json({ status: 'success', privacySettings });
  } catch (error) {
    logger.error('Update profile privacy error:', error);
    const status = error.message === 'User not found' ? 404 : 500;
    return res.status(status).json({ status: 'error', message: error.message });
  }
};

/**
 * DELETE /me
 */
const deleteCurrentUserAccount = async (req, res) => {
  try {
    await userService.hardDeleteAccount(req.decodedToken.userId);
    return res.status(202).json({ status: 'success', message: 'Account deleted successfully' });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ status: 'error', message: 'User not found' });
    logger.error('Delete account error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to delete account' });
  }
};

// ─── Hidden Users (Radar) ─────────────────────────────────────────────────────

const UserModel = mongoose.model('User');

/**
 * GET /me/hidden/users
 */
const getHiddenUsers = async (req, res) => {
  try {
    const user = await UserModel.findById(req.decodedToken.userId)
      .populate('hiddenUsers', '_id name imageUrl')
      .lean();
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const data = (user.hiddenUsers || []).map(u => ({
      _id:        u._id?.toString(),
      name:       u.name      ?? null,
      pictureUrl: u.imageUrl  ?? null,
    }));
    return res.status(200).json({ data });
  } catch (error) {
    logger.error('Get hidden users error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get hidden users' });
  }
};

/**
 * POST /me/hidden/users
 */
const hideUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    await UserModel.findByIdAndUpdate(
      req.decodedToken.userId,
      { $addToSet: { hiddenUsers: userId } }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Hide user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to hide user' });
  }
};

/**
 * DELETE /me/hidden/users/:userId
 */
const unhideUser = async (req, res) => {
  try {
    const { userId } = req.params;
    await UserModel.findByIdAndUpdate(
      req.decodedToken.userId,
      { $pull: { hiddenUsers: userId } }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Unhide user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to unhide user' });
  }
};

// ─── Hidden Connections ───────────────────────────────────────────────────────

/**
 * GET /me/hidden/connections
 */
const getHiddenConnections = async (req, res) => {
  try {
    const user = await UserModel.findById(req.decodedToken.userId)
      .populate('hiddenConnections.userId', '_id name imageUrl')
      .lean();
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const data = (user.hiddenConnections || []).map(c => ({
      userId:       c.userId?._id?.toString() ?? c.userId?.toString(),
      userName:     c.userId?.name      ?? null,
      userImageUrl: c.userId?.imageUrl  ?? null,
      hiddenAt:     c.hiddenAt          ?? null,
    }));
    return res.status(200).json({ data });
  } catch (error) {
    logger.error('Get hidden connections error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get hidden connections' });
  }
};

/**
 * POST /me/hidden/connections
 */
const hideConnection = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    // Only add if not already hidden
    const user = await UserModel.findById(req.decodedToken.userId).select('hiddenConnections');
    const alreadyHidden = user?.hiddenConnections?.some(c => c.userId?.toString() === userId);
    if (!alreadyHidden) {
      await UserModel.findByIdAndUpdate(
        req.decodedToken.userId,
        { $push: { hiddenConnections: { userId, hiddenAt: new Date() } } }
      );
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Hide connection error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to hide connection' });
  }
};

/**
 * DELETE /me/hidden/connections/:userId
 */
const unhideConnection = async (req, res) => {
  try {
    const { userId } = req.params;
    await UserModel.findByIdAndUpdate(
      req.decodedToken.userId,
      { $pull: { hiddenConnections: { userId } } }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Unhide connection error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to unhide connection' });
  }
};

// ─── Key Escrow ──────────────────────────────────────────────────────────────

/**
 * GET /me/key-escrow
 * Retrieves the user's key escrow. If not exists, creates it with a new escrow key.
 */
const getKeyEscrow = async (req, res) => {
  try {
    const userId = req.decodedToken.userId;
    
    let escrow = await KeyEscrow.findOne({ userId });

    if (!escrow) {
      // First time — generate a random 32-byte escrow key
      const escrowKey = crypto.randomBytes(32).toString('base64');
      escrow = await KeyEscrow.create({
        userId,
        escrowKey,
        bundle: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return res.status(200).json({
      status: 'success',
      escrowKey: escrow.escrowKey,
      bundle: escrow.bundle
    });
  } catch (error) {
    logger.error('Get key escrow error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve key escrow' });
  }
};

/**
 * PUT /me/key-escrow
 * Uploads/updates the user's key escrow bundle (nonce, ciphertext, version).
 */
const uploadKeyEscrow = async (req, res) => {
  try {
    const userId = req.decodedToken.userId;
    const { nonce, ciphertext, version } = req.body;

    if (!nonce || !ciphertext || version === undefined) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required fields: nonce, ciphertext, version' 
      });
    }

    await KeyEscrow.findOneAndUpdate(
      { userId },
      {
        bundle: { nonce, ciphertext, version },
        updatedAt: new Date()
      },
      { upsert: true }
    );

    return res.status(200).json({ status: 'success', success: true });
  } catch (error) {
    logger.error('Upload key escrow error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to upload key escrow' });
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUserResponse(user) {
  let phoneNumber = null;
  if (user.phone) {
    try { phoneNumber = userService.decryptPhone(user.phone); } catch (_) {}
  }

  let location = null;
  if (user.location?.point?.coordinates?.length === 2) {
    location = {
      longitude:   user.location.point.coordinates[0],
      latitude:    user.location.point.coordinates[1],
      recordedAt:  user.location.recordedAt || null,
    };
  }

  let device = null;
  if (user.device) {
    device = {
      id:         user.device._id?.toString(),
      platform:   user.device.platform   || null,
      os:         user.device.os         || null,
      appVersion: user.device.appVersion || null,
      status:     user.device.status     || null,
      state:      user.device.state      || null,
    };
  }

  const resolvedId = user._id?.toString() || user.id;
  return {
    _id:          resolvedId,
    id:           resolvedId,
    status:       user.status   ?? null,
    name:         user.name     ?? null,
    email:        user.email    ?? null,
    phone:        phoneNumber,
    phoneNumber,
    appleId:      user.appleId  ?? null,
    googleId:     user.googleId ?? null,
    pictureUrl:   user.imageUrl ?? null,
    imageUrl:     user.imageUrl ?? null,
    isPublic:     user.isPublic ?? false,
    bio:          user.bio      ?? null,
    age:          user.age      ?? null,
    gender:       user.gender   ?? null,
    dateOfBirth:  user.dateOfBirth ?? null,
    interestedIn: user.interestedIn ?? null,
    radar: {
      enabled:   user.radar?.enabled   ?? true,
      invisible: user.radar?.invisible ?? false,
    },
    lastSeen:     user.lastSeen     ?? null,
    registeredOn: user.registeredOn ?? null,
    lastLogin:    user.lastLogin    ?? null,
    location,
    device,
    notificationPreferences: user.notificationPreferences ?? null,
    privacySettings:         user.privacySettings         ?? null,
    visibilityPreferences: user.visibilityPreferences ? {
      womenOnly: user.visibilityPreferences.womenOnly ?? false,
      menOnly:   user.visibilityPreferences.menOnly   ?? false,
      photoBlur: user.visibilityPreferences.photoBlur ?? false,
    } : null,
  };
}

module.exports = {
  getCurrentUserProfile,
  setupProfile,
  updateCurrentUserProfile,
  updateCurrentUserPicture,
  updateCurrentUserLocation,
  updatePresence,
  updateRadarStatus,
  updateRadarInvisible,
  updateNotificationPreferences,
  updateVisibilityPreferences,
  updateProfilePrivacy,
  deleteCurrentUserAccount,
  getHiddenUsers,
  hideUser,
  unhideUser,
  getHiddenConnections,
  hideConnection,
  unhideConnection,
  getKeyEscrow,
  uploadKeyEscrow,
};
