const mongoose = require('mongoose');

const studentProgressSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  exercise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  qcmAnswers: [{
    questionIndex: Number,
    selectedOption: String,
    isCorrect: Boolean,
    pointsEarned: Number
  }],
  fillBlankAnswers: [{
    questionIndex: Number,
    blankAnswers: [{
      blankIndex: Number,
      studentAnswer: String,
      isCorrect: Boolean
    }],
    pointsEarned: Number
  }],
  customAnswers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  totalPointsEarned: {
    type: Number,
    required: true,
    min: 0
  },
  maxPossiblePoints: {
    type: Number,
    required: true
  },
  accuracyPercentage: {
    type: Number,
    min: 0,
    max: 100
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: Date.now
  },
  timeSpent: {
    type: Number,
    default: 0
  },
  attemptNumber: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

studentProgressSchema.pre('save', function(next) {
  if (this.maxPossiblePoints > 0) {
    this.accuracyPercentage = Math.round((this.totalPointsEarned / this.maxPossiblePoints) * 100);
  }

  if (this.timeSpent === 0 && this.startedAt && this.completedAt) {
    this.timeSpent = Math.floor((this.completedAt - this.startedAt) / 1000);
  }

  next();
});

studentProgressSchema.methods.getAnswersByType = function(exerciseType) {
  switch (exerciseType) {
    case 'qcm':
      return this.qcmAnswers;
    case 'fill_blanks':
      return this.fillBlankAnswers;
    default:
      return this.customAnswers[exerciseType] || [];
  }
};

studentProgressSchema.methods.addAnswers = function(exerciseType, answers) {
  switch (exerciseType) {
    case 'qcm':
      this.qcmAnswers = answers;
      break;
    case 'fill_blanks':
      this.fillBlankAnswers = answers;
      break;
    default:
      if (!this.customAnswers) this.customAnswers = {};
      this.customAnswers[exerciseType] = answers;
  }
};

studentProgressSchema.index({ student: 1, exercise: 1, attemptNumber: 1 }, { unique: true });
studentProgressSchema.index({ class: 1, subject: 1 });
studentProgressSchema.index({ student: 1, subject: 1 });
studentProgressSchema.index({ completedAt: -1 });

module.exports = mongoose.model('StudentProgress', studentProgressSchema);
