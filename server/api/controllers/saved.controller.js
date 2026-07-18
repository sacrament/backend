/**
 * Saved Users Controller (Quick Info "save user")
 * Handles saved users: GET /users/saved, POST /users/saved, DELETE /users/saved/:userId
 * Fully separate from Favorites — own model/table, no shared state.
 */

const UserService = require('../../services/domain/user/user.service');
const userService = new UserService();
const logger = require('../../utils/logger');

/**
 * Get saved users list
 * GET /users/saved
 */
const getSaved = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const saved = await userService.getSaved(userId);

    return res.status(200).json(saved.map(formatUserResponse));

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    logger.error('Get saved users error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get saved users' });
  }
};

/**
 * Add a user to saved
 * POST /users/saved
 * Body: { savedUserId: String }
 */
const addSaved = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { savedUserId } = req.body;

    if (!savedUserId) {
      return res.status(400).json({ status: 'error', message: 'savedUserId is required' });
    }

    if (userId === savedUserId) {
      return res.status(400).json({ status: 'error', message: 'Cannot save yourself' });
    }

    await userService.addSaved(userId, savedUserId);

    return res.status(200).json({ status: 'success', message: 'Added to saved' });

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    logger.error('Add saved user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to add saved user' });
  }
};

/**
 * Remove a user from saved
 * DELETE /users/saved/:userId
 */
const removeSaved = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { userId: targetUserId } = req.params;

    await userService.removeSaved(userId, targetUserId);

    return res.status(200).json({ status: 'success', message: 'Removed from saved' });

  } catch (error) {
    logger.error('Remove saved user error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to remove saved user' });
  }
};

function formatUserResponse(user) {
  return {
    id: user._id?.toString(),
    name: user.name || '',
    username: user.username || null,
    pictureUrl: user.imageUrl || null,
    bio: user.bio || null,
    gender: user.gender || null,
    age: user.age || null,
    interestedIn: user.interestedIn || null,
    isPublic: user.isPublic || false,
    status: user.status || 'active'
  };
}

module.exports = { getSaved, addSaved, removeSaved };
