const UserService = require('../../services/domain/user/user.service');
const ChatService = require('../../services/domain/chat/chat.service');
const ReportService = require('../../services/domain/report/report.service');
const userService = new UserService();
const chatService = new ChatService();
const reportService = new ReportService();
const logger = require('../../utils/logger');

/**
 * Search Users by Name
 * GET /users?name=<name>&page=0&size=20
 */
const searchUsers = async (req, res) => {
    try {
        const { name, page = 0, size = 20 } = req.query;

        if (!name || name.trim() === '') {
            return res.status(400).json({ status: 'error', message: 'Search name is required' });
        }

        const { users, totalPages } = await userService.searchByName(name, parseInt(page), parseInt(size));

        return res.status(200).json({
            content: users.map(formatPublicUserResponse),
            totalPages
        });
    } catch (error) {
        logger.error('Search users error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to search users' });
    }
};

/**
 * Get User by ID
 * GET /users/:id
 */
const getUserById = async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
        return res.status(200).json({ status: 'success', user: formatPublicUserResponse(user) });
    } catch (error) {
        logger.error('Get user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get user' });
    }
};

/**
 * Verify phone numbers against Winky accounts
 * POST /users/verify/phones
 */
const verifyPhones = async (req, res) => {
    try {
        const { phones } = req.body;

        if (!phones || !Array.isArray(phones)) {
            return res.status(400).json({ status: 'error', message: 'phones must be an array' });
        }

        const result = await userService.findUsersByPhones(phones);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Verify phones error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to verify phones' });
    }
};

/**
 * Send SMS to phone numbers
 * POST /users/send/sms
 */
const sendSMSToUsers = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { phones } = req.body;
        const result = await userService.sendSMS(userId, phones);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Send SMS error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Blocked Users
 * GET /users/blocked
 */
const getBlockedUsers = async (req, res) => {
    try {
        const result = await userService.getAllBlockedUsers(req.decodedToken.userId);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Get blocked users error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Block a User
 * POST /users/block
 */
const blockUser = async (req, res) => {
    const { userId, reason, description } = req.body;

    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const result = await userService.blockUser(userId, req.decodedToken, reason, description);
        return res.status(200).json({ status: 'success', result: { blocked: true, ...result } });
    } catch (error) {
        logger.error('Block user error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Unblock a User
 * POST /users/unblock
 */
const unblockUser = async (req, res) => {
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const result = await userService.unblockUser(userId, req.decodedToken);
        return res.status(200).json({ status: 'success', result: { unblocked: true, ...result } });
    } catch (error) {
        logger.error('Unblock user error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Unblock a User by URL param
 * DELETE /users/blocks/:userId
 */
const unblockUserById = async (req, res) => {
    const { userId } = req.params;

    try {
        await userService.unblockUser(userId, req.decodedToken);
        return res.status(200).json({ unblocked: true });
    } catch (error) {
        logger.error('Unblock user by id error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Content Storage
 * GET /users/content
 */
const contentStorage = async (req, res) => {
    try {
        const result = await userService.getContentStorageFor(req.decodedToken.userId);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Content storage error:', error);
        return res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * Delete Content by ID
 * DELETE /users/content/single
 */
const deleteContentById = async (req, res) => {
    try {
        const { id } = req.body;
        const result = await userService.deleteMessageObjectBy(id);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Delete content error:', error);
        return res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * Get Unread Message Count
 * GET /users/unreadMessages
 */
const getUnreadMessagesForUser = async (req, res) => {
    try {
        const result = await chatService.countUnreadMessagesForUser(req.decodedToken.userId);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Get unread messages error:', error);
        return res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * Send a Connection Request
 * POST /users/sendConnectionRequest
 */
const sendConnectionRequest = async (req, res) => {
    try {
        const { to } = req.body;
        if (!to) return res.status(400).json({ status: 'error', message: 'to is required' });

        const result = await userService.sendConnectionRequest(req.decodedToken.userId, to);
        return res.status(201).json({ status: 'success', request: result.request });
    } catch (error) {
        logger.error('Send connection request error:', error);
        const status = error.message === 'Already connected' ? 409 : 500;
        return res.status(status).json({ status: 'error', message: error.message });
    }
};

/**
 * Cancel a Connection Request
 * POST /users/cancelConnectionRequest
 */
const cancelConnectionRequest = async (req, res) => {
    try {
        const { to } = req.body;
        if (!to) return res.status(400).json({ status: 'error', message: 'to is required' });

        const result = await userService.cancelConnectionRequest(req.decodedToken.userId, to);
        return res.status(200).json({ status: 'success', request: result.request });
    } catch (error) {
        logger.error('Cancel connection request error:', error);
        const status = error.message === 'No request found' ? 404 : 500;
        return res.status(status).json({ status: 'error', message: error.message });
    }
};

/**
 * Respond to a Connection Request
 * POST /users/respondConnectionRequest
 */
const respondConnectionRequest = async (req, res) => {
    try {
        const { to, response } = req.body;

        if (!to || !response) {
            return res.status(400).json({ status: 'error', message: 'to and response are required' });
        }

        if (!['accepted', 'declined'].includes(response)) {
            return res.status(400).json({ status: 'error', message: 'response must be "accepted" or "declined"' });
        }

        const result = await userService.respondConnectionRequest(req.decodedToken.userId, to, response);
        return res.status(200).json({ status: 'success', result });
    } catch (error) {
        logger.error('Respond connection request error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPublicUserResponse(user) {
    let age = user.age ?? null;
    if (age === null && user.dateOfBirth) {
        const diff = Date.now() - new Date(user.dateOfBirth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    return {
        id:           user._id?.toString() || user.id,
        status:       user.status       ?? null,
        name:         user.name         ?? null,
        pictureUrl:   user.imageUrl     ?? null,
        isPublic:     user.isPublic     ?? false,
        bio:          user.bio          ?? null,
        age,
        gender:       user.gender       ?? null,
        interestedIn: user.interestedIn ?? null,
        showRadar:    user.radar?.show  ?? true,
    };
}

/**
 * Get Connection Requests
 * GET /users/connectionRequests
 */
const getConnectionRequests = async (req, res) => {
    try {
        const { requests, connections } = await userService.allRequests(req.decodedToken.userId);
        return res.status(200).json({ status: 'success', data: { requests, connections } });
    } catch (error) {
        logger.error('Get connection requests error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get connection requests' });
    }
};

/**
 * Check connection request status between current user and another user
 * GET /users/checkConnectionRequest?to=<userId>
 */
const checkConnectionRequest = async (req, res) => {
    try {
        const { to } = req.query;
        if (!to) return res.status(400).json({ status: 'error', message: 'Missing required query param: to' });
        const request = await userService.getConnectionRequest(req.decodedToken.userId, to);
        return res.status(200).json(request);
    } catch (error) {
        logger.error('Check connection request error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to check connection request' });
    }
};

// ─── Reports ──────────────────────────────────────────────────────────────────

const REPORT_TYPE_ENUM = ['harassment', 'inappropriate_content', 'spam', 'fake_profile', 'inappropriate_behavior', 'other'];

/**
 * Get user's filed reports
 * GET /users/report
 */
const getMyReports = async (req, res) => {
    try {
        const reports = await reportService.getReportsByReporter(req.decodedToken.userId);
        const data = reports.map(r => ({
            _id:            r._id?.toString(),
            reportedUserId: r.reported?._id?.toString() ?? r.reported?.toString(),
            userName:       r.reported?.name     ?? null,
            userImageUrl:   r.reported?.imageUrl ?? null,
            reason:         r.type               ?? r.reason ?? null,
            status:         r.status             ?? null,
            reportedAt:     r.createdOn          ?? null,
        }));
        return res.status(200).json({ status: 'success', data });
    } catch (error) {
        logger.error('Get my reports error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get reports' });
    }
};

/**
 * File a report against a user
 * POST /users/report
 * Supports: userId, reason, description, evidence?: [messageId]
 */
const fileReport = async (req, res) => {
    try {
        const reporterId = req.decodedToken.userId;
        const { userId, reason, description, evidence } = req.body;

        if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });
        if (!reason) return res.status(400).json({ status: 'error', message: 'reason is required' });

        const type = REPORT_TYPE_ENUM.includes(reason) ? reason : 'other';

        // Support single message in evidence or messageId field
        let messageId = null;
        if (evidence && Array.isArray(evidence) && evidence.length > 0) {
            messageId = evidence[0]; // Use first message ID if provided
        } else if (evidence && typeof evidence === 'string') {
            messageId = evidence;
        }

        const report = await reportService.createReport({
            reporterId,
            reportedId: userId,
            type,
            reason,
            description: description ?? null,
            messageId: messageId ?? null,
        });

        return res.status(201).json({
            status: 'success',
            _id: report._id?.toString(),
            reportStatus: report.status
        });
    } catch (error) {
        logger.error('File report error:', error);
        return res.status(500).json({ status: 'error', message: error.message || 'Failed to file report' });
    }
};

module.exports = {
    searchUsers,
    getUserById,
    verifyPhones,
    sendSMSToUsers,
    getBlockedUsers,
    blockUser,
    unblockUser,
    unblockUserById,
    contentStorage,
    sendConnectionRequest,
    cancelConnectionRequest,
    deleteContentById,
    getUnreadMessagesForUser,
    respondConnectionRequest,
    getConnectionRequests,
    checkConnectionRequest,
    getMyReports,
    fileReport,
};
