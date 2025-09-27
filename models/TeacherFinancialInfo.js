// models/TeacherFinancialInfo.js
const mongoose = require('mongoose');

const teacherFinancialInfoSchema = new mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  contractType: {
    type: String,
    enum: ['monthly', 'hourly'],
    required: true
  },
  monthlySalary: {
    type: Number,
    required: function() {
      return this.contractType === 'monthly';
    },
    min: 0
  },
  hourlyRate: {
    type: Number,
    required: function() {
      return this.contractType === 'hourly';
    },
    min: 0
  },
  contractualHoursPerMonth: {
    type: Number,
    required: function() {
      return this.contractType === 'hourly';
    },
    min: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  // Array of months (1-12) that this contract covers
  contractMonths: {
    type: [Number],
    required: true,
    validate: {
      validator: function(months) {
        return months.length > 0 && months.every(month => month >= 1 && month <= 12);
      },
      message: 'Contract months must be an array of valid months (1-12) and cannot be empty'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
teacherFinancialInfoSchema.index({ teacher: 1, school: 1 });
teacherFinancialInfoSchema.index({ school: 1, isActive: 1 });

// Helper method to get contract duration in months
teacherFinancialInfoSchema.methods.getContractDuration = function() {
  return this.contractMonths.length;
};

// Helper method to check if a specific month is covered by this contract
teacherFinancialInfoSchema.methods.coversMonth = function(month) {
  return this.contractMonths.includes(month);
};

module.exports = mongoose.model('TeacherFinancialInfo', teacherFinancialInfoSchema);