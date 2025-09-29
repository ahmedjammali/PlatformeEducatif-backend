// models/Session.js
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  // Reference to the main schedule
  schedule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true
  },
  
  // Specific date for this session
  sessionDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        // Ensure date is not in the past (except for today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return v >= today;
      },
      message: 'Session date cannot be in the past'
    }
  },
  
  // Day of the week (automatically calculated from sessionDate)
  dayOfWeek: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  },
  
  // Time slot
  startTime: {
    type: String, // Format: "HH:MM" (24-hour format)
    required: true,
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  
  endTime: {
    type: String, // Format: "HH:MM" (24-hour format)
    required: true,
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format'
    }
  },
  
  // Duration in minutes (calculated automatically)
  duration: {
    type: Number,
  },
  
  // Academic information
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Class information - flexible to handle both class objects and simple class names/numbers
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false // Made optional for flexible class handling
  },
  
  // Alternative class identifier (for schools using simple class names/numbers)
  className: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Either class ObjectId or className must be provided
        return this.class || (v && v.length > 0);
      },
      message: 'Either class reference or class name must be provided'
    }
  },
  
  // Class grade/level (e.g., "Grade 10", "Form 2", "Year 11")
  classGrade: {
    type: String,
    required: true,
    trim: true
  },
  
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  
  // Session details
  sessionType: {
    type: String,
    enum: ['lecture', 'practical', 'exam', 'revision', 'tutorial', 'lab', 'fieldwork', 'other'],
    default: 'lecture'
  },
  
  room: {
    type: String,
    trim: true
  },
  
  notes: {
    type: String,
    trim: true
  },
  
  // Week type for alternating schedules
  weekType: {
    type: String,
    enum: ['A', 'B', 'both'],
    required: true,
    default: 'both'
  },
  
  // Session status
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled'
  },
  
  // Attendance tracking
  expectedStudents: {
    type: Number,
    default: 0
  },
  
  actualAttendance: {
    type: Number,
    default: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // School reference for multi-tenancy
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
sessionSchema.index({ schedule: 1, sessionDate: 1, startTime: 1 });
sessionSchema.index({ teacher: 1, sessionDate: 1, startTime: 1 });
sessionSchema.index({ className: 1, sessionDate: 1, startTime: 1 });
sessionSchema.index({ school: 1, sessionDate: 1, isActive: 1 });
sessionSchema.index({ sessionDate: 1, status: 1 });

// Compound index for conflict detection
sessionSchema.index({ 
  teacher: 1, 
  sessionDate: 1,
  startTime: 1, 
  endTime: 1, 
  isActive: 1 
});

sessionSchema.index({ 
  className: 1, 
  sessionDate: 1,
  startTime: 1, 
  endTime: 1, 
  isActive: 1 
});

// Pre-save middleware to calculate duration, dayOfWeek and validate
sessionSchema.pre('save', function(next) {
  // Calculate day of week from sessionDate
  if (this.sessionDate) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    this.dayOfWeek = dayNames[this.sessionDate.getDay()];
  }
  
  // Calculate duration
  if (this.startTime && this.endTime) {
    const start = this.startTime.split(':').map(Number);
    const end = this.endTime.split(':').map(Number);
    
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    
    this.duration = endMinutes - startMinutes;
    
    // Validate duration (15 minutes minimum, 8 hours maximum)
    if (this.duration < 15) {
      return next(new Error('Session duration must be at least 15 minutes'));
    }
    if (this.duration > 480) { // 8 hours = 480 minutes
      return next(new Error('Session duration cannot exceed 8 hours'));
    }
  }
  
  // Ensure className is set if class is provided
  if (this.class && !this.className) {
    // This will be handled by population in the controller
  }
  
  next();
});

// Method to check for time conflicts
sessionSchema.methods.hasTimeConflict = async function(excludeSessionId = null) {
  const Session = this.constructor;
  
  // Build base conflict query for same date
  const baseConflictQuery = {
    _id: { $ne: excludeSessionId || this._id },
    sessionDate: this.sessionDate,
    isActive: true,
    school: this.school,
    status: { $nin: ['cancelled', 'rescheduled'] }
  };

  // Check for teacher conflicts (teacher can't be in two places at once)
  const teacherConflicts = await Session.find({
    ...baseConflictQuery,
    teacher: this.teacher,
    $and: [
      { startTime: { $lt: this.endTime } },
      { endTime: { $gt: this.startTime } }
    ]
  }).populate('subject', 'name');

  // Check for class conflicts (class can't have two sessions at once)
  let classConflicts = [];
  if (this.className) {
    classConflicts = await Session.find({
      ...baseConflictQuery,
      className: this.className,
      $and: [
        { startTime: { $lt: this.endTime } },
        { endTime: { $gt: this.startTime } }
      ]
    }).populate('teacher', 'name').populate('subject', 'name');
  }

  // Combine all conflicts
  const allConflicts = [...teacherConflicts, ...classConflicts];
  
  return allConflicts.length > 0 ? allConflicts : null;
};

// Method to format time display
sessionSchema.methods.getFormattedTime = function() {
  return `${this.startTime} - ${this.endTime}`;
};

// Method to get duration in hours and minutes
sessionSchema.methods.getFormattedDuration = function() {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  
  if (hours === 0) {
    return `${minutes}min`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}min`;
  }
};

// Method to check if session is happening today
sessionSchema.methods.isToday = function() {
  const today = new Date();
  const sessionDate = new Date(this.sessionDate);
  
  return (
    today.getDate() === sessionDate.getDate() &&
    today.getMonth() === sessionDate.getMonth() &&
    today.getFullYear() === sessionDate.getFullYear()
  );
};

// Method to get session status based on current time
sessionSchema.methods.getCurrentStatus = function() {
  if (!this.isToday()) {
    return this.sessionDate < new Date() ? 'completed' : 'scheduled';
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  if (currentTime < this.startTime) {
    return 'upcoming';
  } else if (currentTime >= this.startTime && currentTime <= this.endTime) {
    return 'ongoing';
  } else {
    return 'completed';
  }
};

// Static method to find sessions by date range
sessionSchema.statics.findByDateRange = function(startDate, endDate, schoolId, filters = {}) {
  const query = {
    sessionDate: {
      $gte: startDate,
      $lte: endDate
    },
    school: schoolId,
    isActive: true,
    ...filters
  };
  
  return this.find(query)
    .populate('teacher', 'name email')
    .populate('subject', 'name')
    .sort({ sessionDate: 1, startTime: 1 });
};

// Static method to get sessions for a specific class
sessionSchema.statics.getClassSchedule = function(className, schoolId, startDate, endDate) {
  const query = {
    className: className,
    school: schoolId,
    isActive: true,
    status: { $nin: ['cancelled'] }
  };
  
  if (startDate && endDate) {
    query.sessionDate = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.find(query)
    .populate('teacher', 'name email')
    .populate('subject', 'name')
    .sort({ sessionDate: 1, startTime: 1 });
};

// Virtual for getting the class display name
sessionSchema.virtual('classDisplayName').get(function() {
  return this.className || (this.class && this.class.name) || 'Unknown Class';
});

module.exports = mongoose.model('Session', sessionSchema);