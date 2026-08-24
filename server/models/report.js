const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Report Model
 * Tracks user reports for harassment, inappropriate behavior, etc.
 */
const ReportSchema = new Schema({
    // User who filed the report
    // Nulled when the reporter deletes their account — the report stays on the
    // accused's record with an anonymous reporter. See spec B6.
    reporter: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
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
            // Matches ReportReason.outsidePressure in the iOS client
            // ("Excessive Pressure to Chat or Call").
            'outside_pressure',
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
    // Repeat reports of the same target by the same reporter are collapsed into
    // one record with a counter rather than inflating the pattern count. See A6.
    occurrences: {
        type: Number,
        default: 1
    },
    lastReportedOn: {
        type: Date,
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
