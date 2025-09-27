  // models/TeacherPaymentDossier.js
  const mongoose = require('mongoose');

  const teacherPaymentDossierSchema = new mongoose.Schema({
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    teacherFinancialInfo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TeacherFinancialInfo',
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true
    },
    academicYear: {
      type: String,
      required: true // Format: "2024-2025"
    },
    hoursWorked: {
      type: Number,
      default: null,
      min: 0
    },
    calculatedAmount: {
      type: Number,
      required: true,
      min: 0
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['unpaid', 'paid', 'partial'],
      default: 'unpaid'
    },
    paymentDate: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true
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
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }, {
    timestamps: true
  });

  // Unique constraint for teacher, month, year combination
  teacherPaymentDossierSchema.index({ 
    teacher: 1, 
    month: 1, 
    year: 1 
  }, { unique: true });

  // Index for better query performance
  teacherPaymentDossierSchema.index({ school: 1, academicYear: 1 });
  teacherPaymentDossierSchema.index({ status: 1, paymentDate: 1 });
  teacherPaymentDossierSchema.index({ teacher: 1, academicYear: 1 });

  // Helper method to get month name
  teacherPaymentDossierSchema.methods.getMonthName = function() {
    const months = [
      'September', 'October', 'November', 'December',
      'January', 'February', 'March', 'April', 
      'May', 'June', 'July', 'August'
    ];
    
    // Convert calendar month to academic month (September = 1)
    let academicMonth = this.month;
    if (this.month >= 9) {
      academicMonth = this.month - 8; // Sept=1, Oct=2, Nov=3, Dec=4
    } else {
      academicMonth = this.month + 4; // Jan=5, Feb=6... Aug=12
    }
    
    return months[academicMonth - 1];
  };

  module.exports = mongoose.model('TeacherPaymentDossier', teacherPaymentDossierSchema);