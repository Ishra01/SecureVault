const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  twoFactorSecret: {
    type: String,
    default: null,
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  vaultSalt: {
    type: String,
    default: null,
  },
  vaultCheck: {
    type: String,
    default: null,
  },
  // Refresh-token rotation: we never store the raw refresh token, only a
  // hash of it (SHA-256 is fine here, not bcrypt - this is a high-entropy
  // random token, not a low-entropy password, so there's nothing for slow
  // hashing to protect against). Replaced on every successful /refresh.
  refreshTokenHash: {
    type: String,
    default: null,
  },
  refreshTokenExpires: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);