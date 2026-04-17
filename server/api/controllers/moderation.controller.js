/**
 * Moderation Controller
 * Handles POST /api/moderation/log and POST /api/moderation/ban.
 * verifyClientToken + verifyToken are applied upstream in routes/index.js.
 */

const mongoose = require('mongoose');
const { getIO } = require('../../socket/io');
const CS = require('../../socket/chat.service');
const logger = require('../../utils/logger');

// ─── Log ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/moderation/log
 * Body: { event, userId, targetId?, details?, timestamp }
 */
const logModerationEvent = async (req, res) => {
    const { event, userId, targetId = null, details = null, timestamp } = req.body;

    if (!event) return res.status(400).json({ status: 'error', message: 'event is required' });
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const ModerationLog = mongoose.model('ModerationLog');
        await ModerationLog.create({
            event,
            userId,
            targetId:  targetId  || null,
            details:   details   || null,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error('Log moderation event error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to log moderation event' });
    }
};

// ─── Ban ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/moderation/ban
 * Body: { userId, reason, warningCount }
 * After persisting the ban, derives restrictions and emits `userFlagged` to the
 * banned user's socket room.
 */
const banUser = async (req, res) => {
    const { userId, reason, warningCount = 0 } = req.body;

    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });
    if (!reason) return res.status(400).json({ status: 'error', message: 'reason is required' });

    // Derive restrictions from warning count
    const restrictions = warningCount >= 3
        ? ['restricted_calling', 'shadow_banned']
        : ['restricted_calling'];

    try {
        const UserBan = mongoose.model('UserBan');
        const ban = await UserBan.create({ userId, reason, warningCount, restrictions });

        const bannedAt = ban.bannedAt.toISOString();

        // Emit userFlagged to the banned user's socket room
        try {
            const IO = getIO();
            const socketService = new CS();
            const isOnline = await socketService.isUserConnected(userId);
            if (isOnline) {
                IO.to(userId).emit('userFlagged', { userId, restrictions });
            }
        } catch (socketErr) {
            // Non-fatal — ban is already persisted
            logger.warn('userFlagged socket emit failed:', socketErr.message);
        }

        return res.status(200).json({ success: true, bannedAt });
    } catch (error) {
        logger.error('Ban user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to ban user' });
    }
};

module.exports = { logModerationEvent, banUser };
