const mongoose = require('mongoose');

// ✅ NEW: Sub-schema for individual payment transactions
const paymentTransactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
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
    ref: 'User',
    required: true
  },
  recordedAt: {
    type: Date,
    default: Date.now
  }
});

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
  
  grade: {
    type: String,
    required: true,
    enum: [
      'Maternal',
      '1ère année primaire', '2ème année primaire', '3ème année primaire', 
      '4ème année primaire', '5ème année primaire', '6ème année primaire',
      '7ème année', '8ème année', '9ème année',
      '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'
    ]
  },
  
  gradeCategory: {
    type: String,
    enum: ['maternelle', 'primaire', 'secondaire'],
    required: true
  },
  
  studentClass: {
    type: String,
    required: true
  },
  
  paymentType: {
    type: String,
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },

  // ✅ FIXED: Inscription Fee with transaction history
  inscriptionFee: {
    applicable: {
      type: Boolean,
      default: false
    },
    price: {
      type: Number,
      default: 0,
      min: 0
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    // ✅ NEW: Track payment history instead of single payment
    paymentHistory: [paymentTransactionSchema]
  },

  tuitionFees: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    monthlyAmount: {
      type: Number,
      required: true,
      min: 0
    }
  },

  // ✅ FIXED: Uniform with transaction history
  uniform: {
    purchased: {
      type: Boolean,
      default: false
    },
    price: {
      type: Number,
      default: 0,
      min: 0
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    // ✅ NEW: Track payment history
    paymentHistory: [paymentTransactionSchema]
  },

  // ✅ FIXED: Transportation with payment history for each month
  transportation: {
    using: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['close', 'far']
    },
    monthlyPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0
    },
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
      // ✅ NEW: Payment history for this month
      paymentHistory: [paymentTransactionSchema]
    }]
  },

  // ✅ FIXED: Tuition monthly payments with transaction history
  tuitionMonthlyPayments: [{
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
    // ✅ NEW: Payment history - tracks ALL payments made for this month
    paymentHistory: [paymentTransactionSchema]
  }],

  totalAmounts: {
    tuition: { type: Number, required: true, min: 0 },
    uniform: { type: Number, default: 0, min: 0 },
    transportation: { type: Number, default: 0, min: 0 },
    inscriptionFee: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 }
  },

  paidAmounts: {
    tuition: { type: Number, default: 0, min: 0 },
    uniform: { type: Number, default: 0, min: 0 },
    transportation: { type: Number, default: 0, min: 0 },
    inscriptionFee: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 }
  },

  remainingAmounts: {
    tuition: { type: Number, default: 0 },
    uniform: { type: Number, default: 0 },
    transportation: { type: Number, default: 0 },
    inscriptionFee: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
  },

  discount: {
    enabled: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['monthly', 'annual']
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    appliedDate: {
      type: Date
    },
    notes: {
      type: String,
      trim: true
    }
  },

  annualTuitionPayment: {
    isPaid: {
      type: Boolean,
      default: false
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
    // ✅ NEW: Payment history for annual payment
    paymentHistory: [paymentTransactionSchema]
  },

  overallStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed', 'overdue'],
    default: 'pending'
  },

  componentStatus: {
    tuition: { type: String, enum: ['pending', 'partial', 'completed', 'overdue'], default: 'pending' },
    uniform: { type: String, enum: ['not_applicable', 'pending', 'completed'], default: 'not_applicable' },
    transportation: { type: String, enum: ['not_applicable', 'pending', 'partial', 'completed', 'overdue'], default: 'not_applicable' },
    inscriptionFee: { type: String, enum: ['not_applicable', 'pending', 'completed'], default: 'not_applicable' }
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
studentPaymentSchema.index({ student: 1, academicYear: 1 });
studentPaymentSchema.index({ school: 1, academicYear: 1 });
studentPaymentSchema.index({ grade: 1 });
studentPaymentSchema.index({ gradeCategory: 1 });
studentPaymentSchema.index({ overallStatus: 1 });

// ✅ NEW: Method to calculate total paid amount from payment history
studentPaymentSchema.methods.calculatePaidAmount = function(paymentHistory) {
  if (!paymentHistory || paymentHistory.length === 0) return 0;
  return paymentHistory.reduce((sum, transaction) => sum + transaction.amount, 0);
};

// ✅ UPDATED: Calculate remaining amounts using payment history
studentPaymentSchema.methods.calculateRemainingAmounts = function() {
  // Calculate tuition from payment history
  this.paidAmounts.tuition = 0;
  this.tuitionMonthlyPayments.forEach(monthly => {
    monthly.paidAmount = this.calculatePaidAmount(monthly.paymentHistory);
    this.paidAmounts.tuition += monthly.paidAmount;
  });

  // Calculate transportation from payment history
  this.paidAmounts.transportation = 0;
  if (this.transportation.using) {
    this.transportation.monthlyPayments.forEach(monthly => {
      monthly.paidAmount = this.calculatePaidAmount(monthly.paymentHistory);
      this.paidAmounts.transportation += monthly.paidAmount;
    });
  }

  // Calculate uniform from payment history
  this.paidAmounts.uniform = this.calculatePaidAmount(this.uniform.paymentHistory);

  // Calculate inscription fee from payment history
  this.paidAmounts.inscriptionFee = this.calculatePaidAmount(this.inscriptionFee.paymentHistory);

  // Calculate grand total
  this.paidAmounts.grandTotal = this.paidAmounts.tuition + 
                                this.paidAmounts.uniform + 
                                this.paidAmounts.transportation + 
                                this.paidAmounts.inscriptionFee;

  // Calculate remaining
  this.remainingAmounts.tuition = this.totalAmounts.tuition - this.paidAmounts.tuition;
  this.remainingAmounts.uniform = this.totalAmounts.uniform - this.paidAmounts.uniform;
  this.remainingAmounts.transportation = this.totalAmounts.transportation - this.paidAmounts.transportation;
  this.remainingAmounts.inscriptionFee = this.totalAmounts.inscriptionFee - this.paidAmounts.inscriptionFee;
  this.remainingAmounts.grandTotal = this.totalAmounts.grandTotal - this.paidAmounts.grandTotal;

  return this.remainingAmounts;
};

studentPaymentSchema.methods.updateComponentStatus = function() {
  // Update tuition status
  if (this.annualTuitionPayment.isPaid) {
    this.componentStatus.tuition = 'completed';
  } else {
    const paidTuitionPayments = this.tuitionMonthlyPayments.filter(p => p.status === 'paid');
    const overdueTuitionPayments = this.tuitionMonthlyPayments.filter(p => p.status === 'overdue');
    const partialTuitionPayments = this.tuitionMonthlyPayments.filter(p => p.status === 'partial');

    if (paidTuitionPayments.length === this.tuitionMonthlyPayments.length) {
      this.componentStatus.tuition = 'completed';
    } else if (overdueTuitionPayments.length > 0) {
      this.componentStatus.tuition = 'overdue';
    } else if (partialTuitionPayments.length > 0 || paidTuitionPayments.length > 0) {
      this.componentStatus.tuition = 'partial';
    } else {
      this.componentStatus.tuition = 'pending';
    }
  }

  // Update uniform status
  if (this.uniform.purchased) {
    this.componentStatus.uniform = this.uniform.isPaid ? 'completed' : 'pending';
  } else {
    this.componentStatus.uniform = 'not_applicable';
  }

  // Update inscription fee status
  if (this.inscriptionFee.applicable) {
    this.componentStatus.inscriptionFee = this.inscriptionFee.isPaid ? 'completed' : 'pending';
  } else {
    this.componentStatus.inscriptionFee = 'not_applicable';
  }

  // Update transportation status
  if (this.transportation.using) {
    const paidTransportPayments = this.transportation.monthlyPayments.filter(p => p.status === 'paid');
    const overdueTransportPayments = this.transportation.monthlyPayments.filter(p => p.status === 'overdue');
    const partialTransportPayments = this.transportation.monthlyPayments.filter(p => p.status === 'partial');

    if (paidTransportPayments.length === this.transportation.monthlyPayments.length) {
      this.componentStatus.transportation = 'completed';
    } else if (overdueTransportPayments.length > 0) {
      this.componentStatus.transportation = 'overdue';
    } else if (partialTransportPayments.length > 0 || paidTransportPayments.length > 0) {
      this.componentStatus.transportation = 'partial';
    } else {
      this.componentStatus.transportation = 'pending';
    }
  } else {
    this.componentStatus.transportation = 'not_applicable';
  }
};

studentPaymentSchema.methods.updateOverallStatus = function() {
  this.updateComponentStatus();

  const applicableStatuses = [this.componentStatus.tuition];
  
  if (this.componentStatus.uniform !== 'not_applicable') {
    applicableStatuses.push(this.componentStatus.uniform);
  }
  
  if (this.componentStatus.transportation !== 'not_applicable') {
    applicableStatuses.push(this.componentStatus.transportation);
  }
  
  if (this.componentStatus.inscriptionFee !== 'not_applicable') {
    applicableStatuses.push(this.componentStatus.inscriptionFee);
  }

  if (applicableStatuses.every(status => status === 'completed')) {
    this.overallStatus = 'completed';
  } else if (applicableStatuses.some(status => status === 'overdue')) {
    this.overallStatus = 'overdue';
  } else if (applicableStatuses.some(status => ['partial', 'completed'].includes(status))) {
    this.overallStatus = 'partial';
  } else {
    this.overallStatus = 'pending';
  }
};

studentPaymentSchema.methods.updatePaymentStatuses = function(gracePeriod = 5) {
  const currentDate = new Date();
  
  // Update tuition payment statuses
  this.tuitionMonthlyPayments.forEach(payment => {
    if (payment.paidAmount >= payment.amount) {
      payment.status = 'paid';
    } else if (payment.paidAmount > 0) {
      payment.status = 'partial';
    } else {
      const gracePeriodDate = new Date(payment.dueDate);
      gracePeriodDate.setDate(gracePeriodDate.getDate() + gracePeriod);
      
      if (currentDate > gracePeriodDate) {
        payment.status = 'overdue';
      } else {
        payment.status = 'pending';
      }
    }
  });

  // Update transportation payment statuses
  if (this.transportation.using) {
    this.transportation.monthlyPayments.forEach(payment => {
      if (payment.paidAmount >= payment.amount) {
        payment.status = 'paid';
      } else if (payment.paidAmount > 0) {
        payment.status = 'partial';
      } else {
        const gracePeriodDate = new Date(payment.dueDate);
        gracePeriodDate.setDate(gracePeriodDate.getDate() + gracePeriod);
        
        if (currentDate > gracePeriodDate) {
          payment.status = 'overdue';
        } else {
          payment.status = 'pending';
        }
      }
    });
  }
  
  this.updateOverallStatus();
};

module.exports = mongoose.model('StudentPayment', studentPaymentSchema);