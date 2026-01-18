// Nearby Users Log Model
// Tracks encounters between users at nearby locations

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const nearbyUsersLogSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  nearbyUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  distance: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false,
  collection: 'nearby_users_logs'
});

// Compound index for efficient queries
nearbyUsersLogSchema.index({ userId: 1, nearbyUserId: 1, timestamp: -1 });
nearbyUsersLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('NearbyUsersLog', nearbyUsersLogSchema);
