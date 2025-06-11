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
  createItBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'easy'
  },
  qcmQuestions: [{
    question: {
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
      default: 1
    }
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
      }
    }],
    points: {
      type: Number,
      default: 1
    }
  }],
  customQuestions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  metadata: {
    instructions: String,
    estimatedTime: Number,
    requiresImages: Boolean,
    requiresAudio: Boolean,
    customSettings: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

exerciseSchema.pre('save', function(next) {
  let total = 0;

  switch (this.type) {
    case 'qcm':
      total = this.qcmQuestions.reduce((sum, q) => sum + q.points, 0);
      break;
    case 'fill_blanks':
      total = this.fillBlankQuestions.reduce((sum, q) => sum + q.points, 0);
      break;
    default:
      if (this.customQuestions && this.customQuestions.questions) {
        total = this.customQuestions.questions.reduce((sum, q) => sum + (q.points || 1), 0);
      }
  }

  this.totalPoints = total;
  next();
});

exerciseSchema.methods.getQuestions = function() {
  switch (this.type) {
    case 'qcm':
      return this.qcmQuestions;
    case 'fill_blanks':
      return this.fillBlankQuestions;
    default:
      return this.customQuestions.questions || [];
  }
};

exerciseSchema.statics.getAvailableTypes = function() {
  return [
    { value: 'qcm', label: 'Questions à Choix Multiple' },
    { value: 'fill_blanks', label: 'Remplir les Blancs' }
  ];
};

module.exports = mongoose.model('Exercise', exerciseSchema);
