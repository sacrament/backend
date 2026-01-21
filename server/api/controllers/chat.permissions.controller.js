const mongoose = require('mongoose');
const Chat = mongoose.model('Chat');

/**
 * Get call permissions for a user in a chat
 * GET /chats/:chatId/permissions/:userId
 */
const getPermissions = async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const requestingUserId = req.decodedToken?.userId;

    if (!requestingUserId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if requesting user is a member
    const isRequestingUserMember = chat.members.some(
      m => m.user.toString() === requestingUserId
    );

    if (!isRequestingUserMember) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Find the target user's permissions
    const targetMember = chat.members.find(
      m => m.user.toString() === userId
    );

    if (!targetMember) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found in chat'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        userId: userId,
        chatId: chatId,
        canChat: targetMember.canChat || false,
        canCall: targetMember.canCall || false,
        canVideo: targetMember.canVideo || false
      }
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get permissions'
    });
  }
};

/**
 * Update call permissions for a user in a chat
 * PATCH /chats/:chatId/permissions
 */
const updatePermissions = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, canCall, canVideo } = req.body;
    const requestingUserId = req.decodedToken?.userId;

    if (!requestingUserId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'userId is required'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Only the other member can grant permissions
    if (requestingUserId === userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot modify your own permissions'
      });
    }

    // Check if requesting user is a member
    const isRequestingUserMember = chat.members.some(
      m => m.user.toString() === requestingUserId
    );

    if (!isRequestingUserMember) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Find the target user's member object
    const targetMember = chat.members.find(
      m => m.user.toString() === userId
    );

    if (!targetMember) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found in chat'
      });
    }

    // Update permissions
    if (typeof canCall === 'boolean') {
      targetMember.canCall = canCall;

      // If disabling call, also disable video
      if (!canCall && targetMember.canVideo) {
        targetMember.canVideo = false;
      }
    }

    if (typeof canVideo === 'boolean') {
      // Cannot enable video without call permission
      if (canVideo && !targetMember.canCall) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot enable video without call permission. Enable calls first.'
        });
      }
      targetMember.canVideo = canVideo;
    }

    targetMember.updatedOn = new Date();
    await chat.save();

    return res.status(200).json({
      status: 'success',
      message: 'Permissions updated successfully',
      data: {
        userId: userId,
        chatId: chatId,
        canChat: targetMember.canChat,
        canCall: targetMember.canCall,
        canVideo: targetMember.canVideo
      }
    });

  } catch (error) {
    console.error('Update permissions error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update permissions'
    });
  }
};

/**
 * Grant call permission for a user in a chat
 * POST /chats/:chatId/permissions/grant-call
 */
const grantCallPermission = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;
    const requestingUserId = req.decodedToken?.userId;

    if (!requestingUserId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    const targetMember = chat.members.find(
      m => m.user.toString() === userId
    );

    if (!targetMember) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found in chat'
      });
    }

    targetMember.canCall = true;
    targetMember.updatedOn = new Date();
    await chat.save();

    return res.status(200).json({
      status: 'success',
      message: 'Call permission granted',
      data: {
        userId: userId,
        canCall: true,
        canVideo: targetMember.canVideo
      }
    });

  } catch (error) {
    console.error('Grant call permission error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to grant call permission'
    });
  }
};

/**
 * Grant video permission for a user in a chat
 * POST /chats/:chatId/permissions/grant-video
 */
const grantVideoPermission = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;
    const requestingUserId = req.decodedToken?.userId;

    if (!requestingUserId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    const targetMember = chat.members.find(
      m => m.user.toString() === userId
    );

    if (!targetMember) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found in chat'
      });
    }

    // Must have call permission first
    if (!targetMember.canCall) {
      return res.status(400).json({
        status: 'error',
        message: 'Call permission must be granted first'
      });
    }

    targetMember.canVideo = true;
    targetMember.updatedOn = new Date();
    await chat.save();

    return res.status(200).json({
      status: 'success',
      message: 'Video permission granted',
      data: {
        userId: userId,
        canCall: true,
        canVideo: true
      }
    });

  } catch (error) {
    console.error('Grant video permission error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to grant video permission'
    });
  }
};

module.exports = {
  getPermissions,
  updatePermissions,
  grantCallPermission,
  grantVideoPermission
};
