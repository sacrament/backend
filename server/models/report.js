const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Report Model
 * Tracks user reports for harassment, inappropriate behavior, etc.
 */
const ReportSchema = new Schema({
    // User who filed the report
    reporter: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // User being reported
    reported: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Type of report
    type: {
        type: String,
        enum: [
            'harassment',
            'inappropriate_content',
            'spam',
            'fake_profile',
            'inappropriate_behavior',
            'other'
        ],
        required: true,
        index: true
    },
    // Reason for report
    reason: {
        type: String,
        required: true
    },
    // Optional description
    description: {
        type: String,
        default: null
    },
    // Related chat if report is from a chat context
    chat: {
        type: Schema.Types.ObjectId,
        ref: 'Chat',
        default: null
    },
    // Related message if report is for a specific message
    message: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    // Status of the report
    status: {
        type: String,
        enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
        default: 'pending',
        index: true
    },
    // Action taken
    actionTaken: {
        type: String,
        enum: [
            'none',
            'warning_issued',
            'temporary_restriction',
            'permanent_ban',
            'dismissed'
        ],
        default: 'none'
    },
    // Reviewer (admin/moderator)
    reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Review notes
    reviewNotes: {
        type: String,
        default: null
    },
    // Timestamps
    createdOn: {
        type: Date,
        default: Date.now,
        index: true
    },
    reviewedOn: {
        type: Date,
        default: null
    },
    resolvedOn: {
        type: Date,
        default: null
    }
});

// Compound index for efficient queries
ReportSchema.index({ reporter: 1, reported: 1, createdOn: -1 });
ReportSchema.index({ reported: 1, status: 1 });

mongoose.model('Report', ReportSchema);
