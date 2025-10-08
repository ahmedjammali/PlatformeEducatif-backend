// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// models/User.js
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
    required: function() {
      // Password is required for superadmin, admin, and caissier
      return ['superadmin', 'admin', 'caissier'].includes(this.role);
    },
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'caissier', 'teacher', 'student'],
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: false
  },
  
  // Teacher-specific fields
  phoneNumber: {
    type: String,
    required: function() {
      return this.role === 'teacher';
    },
    trim: true
  },
  
  // Student-specific fields
  parentName: {
    type: String,
    required: function() {
      return this.role === 'student';
    },
    trim: true
  },
  parentCin: {
    type: String,
    required: function() {
      return this.role === 'student';
    },
    trim: true
  },
  parentPhoneNumber: {
    type: String,
    required: function() {
      return this.role === 'student';
    },
    trim: true
  },
  
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

// Hash password before saving (only if password exists)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};
// Method to check if user has access
userSchema.methods.hasAccess = async function() {
  // ✅ Always allowed roles
  if (this.role === 'superadmin' || this.role === 'caissier') return true;

  // ✅ Your special admin’s ID (the one you choose)
  const alwaysAllowedAdminId = '68de92e13509138522a1af37'; // replace with real admin _id
  // const alwaysAllowedAdminId = '68e66a2f15c6ca70bc699ba0'; // replace with real admin _id

  if (this._id.toString() === alwaysAllowedAdminId) return true;

  // ✅ Check if school is active
  if (this.school) {
    const school = await mongoose.model('School').findById(this.school);
    return school && school.isActive;
  }

  // ❌ Otherwise, no access
  return false;
};


module.exports = mongoose.model('User', userSchema);