// models/Schedule.js
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // Basic schedule information
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Teacher-centric: Each schedule belongs to a specific teacher
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Week type system for alternating schedules
  weekType: {
    type: String,
    enum: ['A', 'B', 'both'], // 'A' for week A, 'B' for week B, 'both' for every week
    required: true,
    default: 'both'
  },

  // Optional description
  description: {
    type: String,
    trim: true
  },
  
  // Schedule status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'suspended'],
    default: 'draft'
  },
  
  // School reference
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
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

// Compound indexes for performance
scheduleSchema.index({ school: 1, teacher: 1 });
scheduleSchema.index({ teacher: 1, isActive: 1 });

// Ensure unique schedule per teacher per school (only one active schedule)
scheduleSchema.index(
  { teacher: 1, school: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true }
  }
);

// Virtual for getting session count
scheduleSchema.virtual('sessionCount', {
  ref: 'Session',
  localField: '_id',
  foreignField: 'schedule',
  count: true,
  match: { isActive: true }
});

// Method to get schedule statistics
scheduleSchema.methods.getStatistics = async function() {
  const Session = mongoose.model('Session');
  
  const sessions = await Session.find({ 
    schedule: this._id, 
    isActive: true 
  });

  return {
    totalSessions: sessions.length,
    totalHours: sessions.reduce((sum, s) => sum + s.duration, 0) / 60,
    uniqueClasses: new Set(sessions.map(s => s.className)).size,
    uniqueSubjects: new Set(sessions.map(s => s.subject.toString())).size,
    weekTypeDistribution: {
      A: sessions.filter(s => s.weekType === 'A').length,
      B: sessions.filter(s => s.weekType === 'B').length,
      both: sessions.filter(s => s.weekType === 'both').length
    }
  };
};

module.exports = mongoose.model('Schedule', scheduleSchema);