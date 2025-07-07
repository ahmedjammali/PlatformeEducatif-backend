const mongoose = require('mongoose');


const exerciseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['qcm', 'fill_blanks'],
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  qcmQuestions: [{
    questionText: {
      type: String,
      required: true
    },
    options: [{
      text: {
        type: String,
        required: true
      },
      isCorrect: {
        type: Boolean,
        default: false
      }
    }],
    points: {
      type: Number,
      default: 1,
      min: 0
    },
    explanation: String
  }],
  fillBlankQuestions: [{
    sentence: {
      type: String,
      required: true
    },
    blanks: [{
      position: {
        type: Number,
        required: true
      },
      correctAnswer: {
        type: String,
        required: true
      },
      acceptableAnswers: [String] // Alternative correct answers
    }],
    points: {
      type: Number,
      default: 1,
      min: 0
    },
    hint: String
  }],
  totalPoints: {
    type: Number,
    default: 0
  },
  metadata: {
    instructions: String,
    estimatedTime: {
      type: Number,
      default: 30 // in minutes
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    showAnswersAfterCompletion: {
      type: Boolean,
      default: true
    },
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    shuffleOptions: {
      type: Boolean,
      default: true
    }
  },
  tags: [String],
  dueDate: Date
}, {
  timestamps: true
});

// Calculate total points before saving
exerciseSchema.pre('save', function(next) {
  let total = 0;

  switch (this.type) {
    case 'qcm':
      total = this.qcmQuestions.reduce((sum, q) => sum + q.points, 0);
      break;
    case 'fill_blanks':
      total = this.fillBlankQuestions.reduce((sum, q) => sum + q.points, 0);
      break;
  }

  this.totalPoints = total;
  next();
});

// Validate that at least one question exists
exerciseSchema.pre('save', function(next) {
  if (this.type === 'qcm' && (!this.qcmQuestions || this.qcmQuestions.length === 0)) {
    next(new Error('QCM exercises must have at least one question'));
  } else if (this.type === 'fill_blanks' && (!this.fillBlankQuestions || this.fillBlankQuestions.length === 0)) {
    next(new Error('Fill blanks exercises must have at least one question'));
  }
  next();
});

// Method to get questions based on type
exerciseSchema.methods.getQuestions = function() {
  switch (this.type) {
    case 'qcm':
      return this.qcmQuestions;
    case 'fill_blanks':
      return this.fillBlankQuestions;
    default:
      return [];
  }
};

// Indexes
exerciseSchema.index({ class: 1, subject: 1, isActive: 1 });
exerciseSchema.index({ createdBy: 1, createdAt: -1 });
exerciseSchema.index({ school: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);