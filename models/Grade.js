// models/Grade.js
const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  examName: {
    type: String,
    required: true
  },
  examType: {
    type: String,
    enum: ['controle', 'devoir', 'examen', 'test', 'oral', 'tp', 'autre'],
    required: true
  },
  grade: {
    type: Number,
    required: true,
    min: 0,
    max: 20
    // Removed the validator that restricted to half points
  },
  coefficient: {
    type: Number,
    default: 1,
    min: 0.1,
    max: 5
  },
  examDate: {
    type: Date,
    required: true
  },
  trimester: {
    type: String,
    enum: ['1er Trimestre', '2ème Trimestre', '3ème Trimestre'],
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  comments: {
    type: String,
    maxlength: 500
  },
  appreciation: {
    type: String,
    enum: ['Excellent', 'Très Bien', 'Bien', 'Assez Bien', 'Passable', 'Insuffisant', 'Très Insuffisant']
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  }
}, {
  timestamps: true
});

// Calculate appreciation based on grade
gradeSchema.pre('save', function(next) {
  // French appreciation system
  if (this.grade >= 18) this.appreciation = 'Excellent';
  else if (this.grade >= 16) this.appreciation = 'Très Bien';
  else if (this.grade >= 14) this.appreciation = 'Bien';
  else if (this.grade >= 12) this.appreciation = 'Assez Bien';
  else if (this.grade >= 10) this.appreciation = 'Passable';
  else if (this.grade >= 6) this.appreciation = 'Insuffisant';
  else this.appreciation = 'Très Insuffisant';
  
  next();
});

// Indexes for faster queries
gradeSchema.index({ student: 1, subject: 1, academicYear: 1 });
gradeSchema.index({ class: 1, subject: 1, examType: 1 });
gradeSchema.index({ teacher: 1, examDate: -1 });
gradeSchema.index({ school: 1 });

module.exports = mongoose.model('Grade', gradeSchema);