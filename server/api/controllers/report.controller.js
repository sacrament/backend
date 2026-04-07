const ReportService = require('../../services/domain/report/report.service');
const logger = require('../../utils/logger');

const reportService = new ReportService();

/**
 * Create a new report
 * POST /reports
 */
const createReport = async (req, res) => {
  try {
    const reporterId = req.decodedToken?.userId;
    const { reportedId, type, reason, description, chatId, messageId } = req.body;

    if (!reporterId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    // Validation
    if (!reportedId) {
      return res.status(400).json({
        status: 'error',
        message: 'Reported user ID is required'
      });
    }

    if (reporterId === reportedId) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot report yourself'
      });
    }

    const report = await reportService.createReport({
      reporterId,
      reportedId,
      type,
      reason,
      description,
      chatId,
      messageId
    });

    return res.status(201).json({
      status: 'success',
      message: 'Report submitted successfully. Our team will review it.',
      data: {
        reportId: report._id,
        type: report.type,
        status: report.status
      }
    });

  } catch (error) {
    logger.error('Create report error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create report'
    });
  }
};

/**
 * Get report by ID
 * GET /reports/:reportId
 */
const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const report = await reportService.getReportById(reportId);

    // Only reporter, reported user, or admin can view
    const isInvolved = report.reporter._id.toString() === userId ||
                       report.reported._id.toString() === userId;

    if (!isInvolved) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: report
    });

  } catch (error) {
    logger.error('Get report error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get report'
    });
  }
};

/**
 * Get my filed reports
 * GET /reports/my-reports
 */
const getMyReports = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const reports = await reportService.getReportsByReporter(userId);

    return res.status(200).json({
      status: 'success',
      data: reports
    });

  } catch (error) {
    logger.error('Get my reports error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get reports'
    });
  }
};

/**
 * Get reports against me
 * GET /reports/against-me
 */
const getReportsAgainstMe = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const reports = await reportService.getReportsForUser(userId);

    // Only show resolved reports to the user
    const resolvedReports = reports.filter(r => r.status === 'resolved');

    return res.status(200).json({
      status: 'success',
      data: resolvedReports
    });

  } catch (error) {
    logger.error('Get reports against me error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get reports'
    });
  }
};

/**
 * Get pending reports (admin only)
 * GET /moderation/reports
 */
const getPendingReports = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await reportService.getPendingReports(
      parseInt(limit),
      parseInt(offset)
    );

    return res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    logger.error('Get pending reports error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get reports'
    });
  }
};

/**
 * Update report status (admin only)
 * PATCH /moderation/reports/:reportId
 */
const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, actionTaken, reviewNotes } = req.body;
    const reviewerId = req.decodedToken?.userId;

    if (!reviewerId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }

    const report = await reportService.updateReportStatus(
      reportId,
      status,
      actionTaken,
      reviewerId,
      reviewNotes
    );

    return res.status(200).json({
      status: 'success',
      message: 'Report updated successfully',
      data: report
    });

  } catch (error) {
    logger.error('Update report status error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update report'
    });
  }
};

module.exports = {
  createReport,
  getReportById,
  getMyReports,
  getReportsAgainstMe,
  getPendingReports,
  updateReportStatus
};
