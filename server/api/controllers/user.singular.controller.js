/**
 * User (singular) Controller
 * Handles /api/user/* endpoints — stubbed features from the settings spec.
 * verifyToken is applied at the router level.
 */

const mongoose = require('mongoose');
const UserService = require('../../services/domain/user/user.service');
const ReportService = require('../../services/domain/report/report.service');

const userService = new UserService();
const reportService = new ReportService();

// ─── Mute ─────────────────────────────────────────────────────────────────────

/**
 * POST /user/mute
 * Body: { userId }
 */
const muteUser = async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const MutedUser = mongoose.model('MutedUser');
        await MutedUser.findOneAndUpdate(
            { muter: req.decodedToken.userId, muted: userId },
            { muter: req.decodedToken.userId, muted: userId },
            { upsert: true, new: true }
        );
        return res.status(200).json({ success: true, mutedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Mute user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to mute user' });
    }
};

/**
 * DELETE /user/mute/:userId
 */
const unmuteUser = async (req, res) => {
    const { userId } = req.params;

    try {
        const MutedUser = mongoose.model('MutedUser');
        await MutedUser.findOneAndDelete({ muter: req.decodedToken.userId, muted: userId });
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Unmute user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to unmute user' });
    }
};

/**
 * GET /user/muted
 */
const getMutedUsers = async (req, res) => {
    try {
        const MutedUser = mongoose.model('MutedUser');
        const records = await MutedUser.find({ muter: req.decodedToken.userId })
            .select('muted createdAt')
            .lean();

        const data = records.map(r => ({
            userId:  r.muted?.toString(),
            mutedAt: r.createdAt,
        }));
        return res.status(200).json(data);
    } catch (error) {
        console.error('Get muted users error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get muted users' });
    }
};

// ─── Disappear ────────────────────────────────────────────────────────────────

/**
 * POST /user/disappear
 * Body: { userId }
 * Hide yourself from the given user — they won't see you in nearby/radar.
 */
const disappearFromUser = async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const DisappearedUser = mongoose.model('DisappearedUser');
        await DisappearedUser.findOneAndUpdate(
            { user: req.decodedToken.userId, target: userId },
            { user: req.decodedToken.userId, target: userId },
            { upsert: true, new: true }
        );
        return res.status(200).json({ success: true, disappearedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Disappear from user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to disappear from user' });
    }
};

/**
 * DELETE /user/disappear/:userId
 */
const undisappearFromUser = async (req, res) => {
    const { userId } = req.params;

    try {
        const DisappearedUser = mongoose.model('DisappearedUser');
        await DisappearedUser.findOneAndDelete({ user: req.decodedToken.userId, target: userId });
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Undisappear from user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to un-disappear from user' });
    }
};

/**
 * GET /user/disappeared
 */
const getDisappearedUsers = async (req, res) => {
    try {
        const DisappearedUser = mongoose.model('DisappearedUser');
        const records = await DisappearedUser.find({ user: req.decodedToken.userId })
            .select('target createdAt')
            .lean();

        const data = records.map(r => ({
            userId:        r.target?.toString(),
            disappearedAt: r.createdAt,
        }));
        return res.status(200).json(data);
    } catch (error) {
        console.error('Get disappeared users error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get disappeared users' });
    }
};

// ─── Presence Beacon ─────────────────────────────────────────────────────────

/**
 * POST /user/presence
 * Body: { latitude, longitude, expiresIn } (expiresIn in seconds, default 3600)
 */
const setPresence = async (req, res) => {
    const { latitude, longitude, expiresIn = 3600 } = req.body;

    if (latitude === undefined || latitude === null) {
        return res.status(400).json({ status: 'error', message: 'latitude is required' });
    }
    if (longitude === undefined || longitude === null) {
        return res.status(400).json({ status: 'error', message: 'longitude is required' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90  || lat > 90)  return res.status(400).json({ status: 'error', message: 'Invalid latitude' });
    if (isNaN(lon) || lon < -180 || lon > 180) return res.status(400).json({ status: 'error', message: 'Invalid longitude' });

    const expiresAt = new Date(Date.now() + Math.abs(parseInt(expiresIn)) * 1000);

    try {
        const User = mongoose.model('User');
        await User.findByIdAndUpdate(req.decodedToken.userId, {
            presenceBeacon: { latitude: lat, longitude: lon, expiresAt },
        });
        return res.status(200).json({ success: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
        console.error('Set presence error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to set presence' });
    }
};

/**
 * GET /user/presence/status
 */
const getPresenceStatus = async (req, res) => {
    try {
        const User = mongoose.model('User');
        const user = await User.findById(req.decodedToken.userId).select('presenceBeacon').lean();

        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

        const beacon = user.presenceBeacon;
        const now = new Date();
        const visible = !!(beacon?.expiresAt && beacon.expiresAt > now);

        return res.status(200).json({
            visible,
            expiresAt: beacon?.expiresAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error('Get presence status error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get presence status' });
    }
};

/**
 * DELETE /user/presence
 */
const clearPresence = async (req, res) => {
    try {
        const User = mongoose.model('User');
        await User.findByIdAndUpdate(req.decodedToken.userId, {
            presenceBeacon: { latitude: null, longitude: null, expiresAt: null },
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Clear presence error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to clear presence' });
    }
};

// ─── Reports History ──────────────────────────────────────────────────────────

/**
 * GET /user/reports
 * Returns the current user's submitted reports.
 */
const getMyReports = async (req, res) => {
    try {
        const reports = await reportService.getReportsByReporter(req.decodedToken.userId);
        const data = reports.map(r => ({
            reportId:  r._id?.toString(),
            userId:    r.reported?._id?.toString() ?? r.reported?.toString(),
            reason:    r.type ?? r.reason ?? null,
            status:    r.status ?? null,
            createdAt: r.createdOn ?? null,
        }));
        return res.status(200).json(data);
    } catch (error) {
        console.error('Get my reports error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get reports' });
    }
};

// ─── User Flags ───────────────────────────────────────────────────────────────

/**
 * GET /user/flags/:userId
 * Returns flag/report summary for a given user.
 */
const getUserFlags = async (req, res) => {
    const { userId } = req.params;

    try {
        const Report = mongoose.model('Report');
        const reports = await Report.find({ reported: userId }).select('status createdOn actionTaken').lean();

        const flagCount = reports.length;
        const isFlagged = flagCount > 0;
        const lastFlaggedAt = flagCount > 0
            ? reports.reduce((latest, r) => (r.createdOn > latest ? r.createdOn : latest), reports[0].createdOn)
            : null;

        // Derive restrictions from the most severe action taken
        const actionPriority = { permanent_ban: 4, temporary_restriction: 3, warning_issued: 2, dismissed: 1, none: 0 };
        const worstAction = reports.reduce((worst, r) => {
            return (actionPriority[r.actionTaken] ?? 0) > (actionPriority[worst] ?? 0) ? r.actionTaken : worst;
        }, 'none');

        const restrictions = [];
        if (worstAction === 'permanent_ban')       restrictions.push('banned');
        if (worstAction === 'temporary_restriction') restrictions.push('restricted');
        if (worstAction === 'warning_issued')       restrictions.push('warned');

        return res.status(200).json({
            isFlagged,
            flagCount,
            lastFlaggedAt: lastFlaggedAt?.toISOString() ?? null,
            restrictions,
        });
    } catch (error) {
        console.error('Get user flags error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get user flags' });
    }
};

// ─── Account Deletion Alias ───────────────────────────────────────────────────

/**
 * DELETE /user/me/deleteAccount
 * Alias for DELETE /me — iOS calls both paths.
 */
const deleteAccount = async (req, res) => {
    try {
        await userService.hardDeleteAccount(req.decodedToken.userId);
        return res.status(200).json({ status: 'success', message: 'Account deleted successfully' });
    } catch (error) {
        if (error.message === 'User not found') return res.status(404).json({ status: 'error', message: 'User not found' });
        console.error('Delete account error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to delete account' });
    }
};

module.exports = {
    muteUser,
    unmuteUser,
    getMutedUsers,
    disappearFromUser,
    undisappearFromUser,
    getDisappearedUsers,
    setPresence,
    getPresenceStatus,
    clearPresence,
    getMyReports,
    getUserFlags,
    deleteAccount,
};
