// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'teacher', 'student'],
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: function() {
      return this.role !== 'superadmin';
    }
  },
  // For teachers: classes they teach with subjects
  teachingClasses: [{
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    },
    subjects: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    }]
  }],
  // For students: class they belong to
  studentClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role !== 'superadmin';
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to check if user has access
userSchema.methods.hasAccess = async function() {
  if (this.role === 'superadmin') return true;
  
  if (this.school) {
    const school = await mongoose.model('School').findById(this.school);
    return school && school.isActive;
  }
  
  return false;
};

module.exports = mongoose.model('User', userSchema);