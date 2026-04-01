/**
 * Favorites Controller
 * Handles favorite users: GET /users/favorites, POST /users/favorites, DELETE /users/favorites/:userId
 */

const UserService = require('../../services/domain/user/user.service');
  const userService = new UserService();

/**
 * Get favorite users list
 * GET /users/favorites
 */
const getFavorites = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const favorites = await userService.getFavorites(userId);

    return res.status(200).json(favorites.map(formatUserResponse));

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    console.error('Get favorites error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get favorites' });
  }
};

/**
 * Add a user to favorites
 * POST /users/favorites
 * Body: { favoriteUserId: String }
 */
const addFavorite = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { favoriteUserId } = req.body;

    if (!favoriteUserId) {
      return res.status(400).json({ status: 'error', message: 'favoriteUserId is required' });
    }

    if (userId === favoriteUserId) {
      return res.status(400).json({ status: 'error', message: 'Cannot favorite yourself' });
    }
 
    await userService.addFavorite(userId, favoriteUserId);

    return res.status(200).json({ status: 'success', message: 'Added to favorites' });

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    console.error('Add favorite error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to add favorite' });
  }
};

/**
 * Remove a user from favorites
 * DELETE /users/favorites/:userId
 */
const removeFavorite = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const { userId: targetUserId } = req.params;
 
    await userService.removeFavorite(userId, targetUserId);

    return res.status(200).json({ status: 'success', message: 'Removed from favorites' });

  } catch (error) {
    console.error('Remove favorite error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to remove favorite' });
  }
};

function formatUserResponse(user) {
  return {
    id: user._id?.toString(),
    name: user.name || '',
    pictureUrl: user.imageUrl || null,
    bio: user.bio || null,
    gender: user.gender || null,
    age: user.age || null,
    interestedIn: user.interestedIn || null,
    isPublic: user.isPublic || false,
    status: user.status || 'active'
  };
}

module.exports = { getFavorites, addFavorite, removeFavorite };
