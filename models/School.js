// models/School.js
const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  blockedReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('School', schoolSchema);