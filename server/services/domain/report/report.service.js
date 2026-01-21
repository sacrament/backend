const mongoose = require('mongoose');
const Report = mongoose.model('Report');
const User = mongoose.model('User');

/**
 * ReportService
 * Handles harassment reporting and moderation
 */
class ReportService {
    /**
     * Create a new report
     *
     * @param {Object} data - Report data
     * @param {string} data.reporterId - User filing the report
     * @param {string} data.reportedId - User being reported
     * @param {string} data.type - Report type
     * @param {string} data.reason - Reason for report
     * @param {string} [data.description] - Optional description
     * @param {string} [data.chatId] - Related chat ID
     * @param {string} [data.messageId] - Related message ID
     * @returns {Promise<Object>} Created report
     */
    async createReport(data) {
        const { reporterId, reportedId, type, reason, description, chatId, messageId } = data;

        // Validation
        if (!reporterId || !reportedId) {
            throw new Error('Reporter and reported user IDs are required');
        }

        if (!type || !['harassment', 'inappropriate_content', 'spam', 'fake_profile', 'inappropriate_behavior', 'other'].includes(type)) {
            throw new Error('Invalid report type');
        }

        if (!reason || reason.trim().length === 0) {
            throw new Error('Reason is required');
        }

        // Check if users exist
        const reporter = await User.findById(reporterId);
        const reported = await User.findById(reportedId);

        if (!reporter) {
            throw new Error('Reporter user not found');
        }

        if (!reported) {
            throw new Error('Reported user not found');
        }

        // Create report
        const report = new Report({
            reporter: reporterId,
            reported: reportedId,
            type: type,
            reason: reason,
            description: description || null,
            chat: chatId || null,
            message: messageId || null,
            status: 'pending'
        });

        await report.save();

        // Check for harassment patterns
        await this.checkHarassmentPatterns(reportedId);

        return report;
    }

    /**
     * Get report by ID
     *
     * @param {string} reportId - Report ID
     * @returns {Promise<Object>} Report
     */
    async getReportById(reportId) {
        const report = await Report.findById(reportId)
            .populate('reporter', '_id id name imageUrl')
            .populate('reported', '_id id name imageUrl')
            .populate('reviewedBy', '_id id name')
            .lean()
            .exec();

        if (!report) {
            throw new Error('Report not found');
        }

        return report;
    }

    /**
     * Get all reports for a user (being reported)
     *
     * @param {string} userId - User ID
     * @param {string} [status] - Filter by status
     * @returns {Promise<Array>} Reports
     */
    async getReportsForUser(userId, status = null) {
        const query = { reported: userId };
        if (status) {
            query.status = status;
        }

        const reports = await Report.find(query)
            .populate('reporter', '_id id name imageUrl')
            .populate('reviewedBy', '_id id name')
            .sort({ createdOn: -1 })
            .lean()
            .exec();

        return reports;
    }

    /**
     * Get all pending reports (for moderation)
     *
     * @param {number} limit - Maximum number of reports
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Paginated reports
     */
    async getPendingReports(limit = 50, offset = 0) {
        const query = { status: { $in: ['pending', 'reviewing'] } };

        const [reports, total] = await Promise.all([
            Report.find(query)
                .populate('reporter', '_id id name imageUrl')
                .populate('reported', '_id id name imageUrl')
                .populate('reviewedBy', '_id id name')
                .sort({ createdOn: -1 })
                .limit(limit)
                .skip(offset)
                .lean()
                .exec(),
            Report.countDocuments(query)
        ]);

        return {
            reports,
            total,
            limit,
            offset,
            hasMore: offset + reports.length < total
        };
    }

    /**
     * Update report status and action
     *
     * @param {string} reportId - Report ID
     * @param {string} status - New status
     * @param {string} actionTaken - Action taken
     * @param {string} reviewerId - Reviewer user ID
     * @param {string} [reviewNotes] - Optional notes
     * @returns {Promise<Object>} Updated report
     */
    async updateReportStatus(reportId, status, actionTaken, reviewerId, reviewNotes = null) {
        const validStatuses = ['pending', 'reviewing', 'resolved', 'dismissed'];
        const validActions = ['none', 'warning_issued', 'temporary_restriction', 'permanent_ban', 'dismissed'];

        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status');
        }

        if (!validActions.includes(actionTaken)) {
            throw new Error('Invalid action');
        }

        const report = await Report.findById(reportId);
        if (!report) {
            throw new Error('Report not found');
        }

        report.status = status;
        report.actionTaken = actionTaken;
        report.reviewedBy = reviewerId;
        report.reviewNotes = reviewNotes;
        report.reviewedOn = new Date();

        if (status === 'resolved') {
            report.resolvedOn = new Date();
        }

        await report.save();

        return report;
    }

    /**
     * Check for harassment patterns and take automatic action
     *
     * @param {string} userId - User ID to check
     * @returns {Promise<Object>} Pattern analysis
     */
    async checkHarassmentPatterns(userId) {
        // Get all reports for this user in the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const recentReports = await Report.find({
            reported: userId,
            createdOn: { $gte: thirtyDaysAgo }
        }).lean().exec();

        const reportCount = recentReports.length;
        const harassmentReports = recentReports.filter(r => r.type === 'harassment').length;

        // Pattern detection thresholds
        const patterns = {
            lowRisk: reportCount >= 2 && reportCount < 5,
            mediumRisk: reportCount >= 5 && reportCount < 10,
            highRisk: reportCount >= 10 || harassmentReports >= 5
        };

        // Log pattern (for future automated action)
        console.log(`Harassment pattern check for user ${userId}:`, {
            reportCount,
            harassmentReports,
            ...patterns
        });

        // Return pattern analysis (can be used for automated warnings/restrictions)
        return {
            userId,
            reportCount,
            harassmentReports,
            patterns
        };
    }

    /**
     * Get reports filed by a user
     *
     * @param {string} reporterId - Reporter user ID
     * @returns {Promise<Array>} Reports
     */
    async getReportsByReporter(reporterId) {
        const reports = await Report.find({ reporter: reporterId })
            .populate('reported', '_id id name imageUrl')
            .sort({ createdOn: -1 })
            .lean()
            .exec();

        return reports;
    }

    /**
     * Delete a report
     *
     * @param {string} reportId - Report ID
     * @returns {Promise<boolean>} Success
     */
    async deleteReport(reportId) {
        const result = await Report.findByIdAndDelete(reportId);
        return !!result;
    }
}

module.exports = ReportService;
