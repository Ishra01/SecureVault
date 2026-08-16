const mongoose = require('mongoose');

const passwordSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  website: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  encryptedPassword: {
    type: String,
    required: true,
  },
  strength: {
    type: String,
    default: 'Unknown',
  },
  isBreached: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Password', passwordSchema);