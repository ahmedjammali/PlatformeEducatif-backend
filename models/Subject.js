const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  imagePath: {
    type: String, // You can also use "imageUrl" if storing URLs
    required: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);
