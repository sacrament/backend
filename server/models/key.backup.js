const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const KeyBackup = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Base64-encoded PBKDF2 salt
  salt: {
    type: String,
    required: true
  },
  // Base64-encoded AES-GCM nonce
  nonce: {
    type: String,
    required: true
  },
  // Base64-encoded encrypted key material
  ciphertext: {
    type: String,
    required: true
  },
  // Base64-encoded AES-GCM auth tag
  tag: {
    type: String,
    required: true
  },
  // Version of the backup format (always 2)
  version: {
    type: Number,
    default: 2
  },
  // Client-provided timestamp when backup was created
  createdAt: {
    type: Date,
    required: true
  },
  // Server timestamp when backup was last updated
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-update timestamps on save and update
KeyBackup.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

KeyBackup.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('KeyBackup', KeyBackup);
