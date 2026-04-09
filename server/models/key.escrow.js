const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const KeyEscrow = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Base64-encoded 32 random bytes — generated once, never changes
  escrowKey: {
    type: String,
    required: true
  },
  // Encrypted bundle containing nonce, ciphertext, and version
  // null until first upload
  bundle: {
    nonce: {
      type: String,
      default: null
    },
    ciphertext: {
      type: String,
      default: null
    },
    version: {
      type: Number,
      default: null
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-update timestamps on save and update
KeyEscrow.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

KeyEscrow.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('KeyEscrow', KeyEscrow);
