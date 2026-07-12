const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * One record per (viewer, viewed) pair — upserted on each view so the
 * "Who viewed me" list shows unique viewers with their latest view time.
 */
const profileViewSchema = new Schema({
  viewer:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  viewed:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  viewedAt: { type: Date, default: Date.now },
}, {
  collection: 'profile_views'
});

profileViewSchema.index({ viewer: 1, viewed: 1 }, { unique: true });
// Auto-expire views after 30 days
profileViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ProfileView', profileViewSchema);
