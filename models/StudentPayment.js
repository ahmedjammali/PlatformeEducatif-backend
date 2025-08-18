const mongoose = require('mongoose');

const studentPaymentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  classGroup: {
    type: String,
    enum: ['école', 'college', 'lycée'],
    required: true
  },
  studentClass: {
    type: String,
    required: true
  },
  // Payment schedule type
  paymentType: {
    type: String,
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },
  // Monthly payment records
  monthlyPayments: [{
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    monthName: {
      type: String,
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'partial'],
      default: 'pending'
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentDate: {
      type: Date
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'check', 'bank_transfer', 'online'],
      default: 'cash'
    },
    receiptNumber: {
      type: String
    },
    notes: {
      type: String,
      trim: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Total amounts
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingAmount: {
    type: Number,
    default: function() {
      return this.totalAmount - this.paidAmount;
    }
  },
  // Annual payment details (if paid in full)
  annualPayment: {
    isPaid: {
      type: Boolean,
      default: false
    },
    paymentDate: {
      type: Date
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'check', 'bank_transfer', 'online']
    },
    receiptNumber: {
      type: String
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: {
      type: String,
      trim: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  // Overall payment status
  overallStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed', 'overdue'],
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
studentPaymentSchema.index({ student: 1, academicYear: 1 });
studentPaymentSchema.index({ school: 1, academicYear: 1 });
studentPaymentSchema.index({ 'monthlyPayments.status': 1 });
studentPaymentSchema.index({ overallStatus: 1 });

// Method to update overall status
studentPaymentSchema.methods.updateOverallStatus = function() {
  if (this.annualPayment.isPaid) {
    this.overallStatus = 'completed';
    return;
  }

  const paidPayments = this.monthlyPayments.filter(payment => payment.status === 'paid');
  const overduePayments = this.monthlyPayments.filter(payment => payment.status === 'overdue');
  const partialPayments = this.monthlyPayments.filter(payment => payment.status === 'partial');

  if (paidPayments.length === this.monthlyPayments.length) {
    this.overallStatus = 'completed';
  } else if (overduePayments.length > 0) {
    this.overallStatus = 'overdue';
  } else if (partialPayments.length > 0 || paidPayments.length > 0) {
    this.overallStatus = 'partial';
  } else {
    this.overallStatus = 'pending';
  }
};

// Method to calculate remaining amount
studentPaymentSchema.methods.calculateRemainingAmount = function() {
  this.remainingAmount = this.totalAmount - this.paidAmount;
  return this.remainingAmount;
};

// Method to update payment statuses based on due dates
studentPaymentSchema.methods.updatePaymentStatuses = function(gracePeriod = 5) {
  const currentDate = new Date();
  
  this.monthlyPayments.forEach(payment => {
    if (payment.status === 'paid') return;
    
    const gracePeriodDate = new Date(payment.dueDate);
    gracePeriodDate.setDate(gracePeriodDate.getDate() + gracePeriod);
    
    if (currentDate > gracePeriodDate && payment.status === 'pending') {
      payment.status = 'overdue';
    }
  });
  
  this.updateOverallStatus();
};

module.exports = mongoose.model('StudentPayment', studentPaymentSchema);