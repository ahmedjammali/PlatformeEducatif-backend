// Updated StudentPayment Schema with Grade-specific pricing, Uniform, and Transportation

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
  
  // ✅ UPDATED: Store specific grade instead of class group
grade: {
  type: String,
  required: true,
  enum: [
    // Maternal (single grade)
    'Maternal',
    // Primaire
    '1ère année primaire', '2ème année primaire', '3ème année primaire', 
    '4ème année primaire', '5ème année primaire', '6ème année primaire',
    // Collège (Middle School)
    '7ème année', '8ème année', '9ème année',
    // Lycée (High School)
    '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'
  ]
},
  
  // ✅ NEW: Grade category for easier filtering
  gradeCategory: {
    type: String,
    enum: ['maternelle', 'primaire', 'secondaire'],
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
    notes: {
      type: String,
      trim: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // ✅ NEW: Tuition fees (academic fees)
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

  // ✅ NEW: Uniform purchase details
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
    notes: {
      type: String,
      trim: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // ✅ NEW: Transportation details
  transportation: {
    using: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['close', 'far'],
      required: function() { return this.transportation.using; }
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
    // Monthly transportation payments
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
        enum: ['cash', 'check', 'bank_transfer', 'online']
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
    }]
  },

  // ✅ UPDATED: Tuition monthly payment records
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

  totalAmounts: {
    tuition: { type: Number, required: true, min: 0 },
    uniform: { type: Number, default: 0, min: 0 },
    transportation: { type: Number, default: 0, min: 0 },
    inscriptionFee: { type: Number, default: 0, min: 0 }, // ✅ NEW
    grandTotal: { type: Number, required: true, min: 0 }
  },

  paidAmounts: {
    tuition: { type: Number, default: 0, min: 0 },
    uniform: { type: Number, default: 0, min: 0 },
    transportation: { type: Number, default: 0, min: 0 },
    inscriptionFee: { type: Number, default: 0, min: 0 }, // ✅ NEW
    grandTotal: { type: Number, default: 0, min: 0 }
  },
remainingAmounts: {
    tuition: { type: Number, default: function() { return this.totalAmounts.tuition - this.paidAmounts.tuition; } },
    uniform: { type: Number, default: function() { return this.totalAmounts.uniform - this.paidAmounts.uniform; } },
    transportation: { type: Number, default: function() { return this.totalAmounts.transportation - this.paidAmounts.transportation; } },
    inscriptionFee: { type: Number, default: function() { return this.totalAmounts.inscriptionFee - this.paidAmounts.inscriptionFee; } }, // ✅ NEW
    grandTotal: { type: Number, default: function() { return this.totalAmounts.grandTotal - this.paidAmounts.grandTotal; } }
  },
  discount: {
  enabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['monthly', 'annual'],
    required: function() { return this.discount.enabled; }
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100,
    required: function() { return this.discount.enabled; }
  },
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.discount.enabled; }
  },
  appliedDate: {
    type: Date,
    required: function() { return this.discount.enabled; }
  },
  notes: {
    type: String,
    trim: true
  }
  },

  // ✅ UPDATED: Annual payment details (for tuition only)
  annualTuitionPayment: {
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

componentStatus: {
    tuition: { type: String, enum: ['pending', 'partial', 'completed', 'overdue'], default: 'pending' },
    uniform: { type: String, enum: ['not_applicable', 'pending', 'completed'], default: 'not_applicable' },
    transportation: { type: String, enum: ['not_applicable', 'pending', 'partial', 'completed', 'overdue'], default: 'not_applicable' },
    inscriptionFee: { type: String, enum: ['not_applicable', 'pending', 'completed'], default: 'not_applicable' } // ✅ NEW
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
studentPaymentSchema.index({ grade: 1 });
studentPaymentSchema.index({ gradeCategory: 1 });
studentPaymentSchema.index({ overallStatus: 1 });
studentPaymentSchema.index({ 'componentStatus.tuition': 1 });
studentPaymentSchema.index({ 'componentStatus.transportation': 1 });

// ✅ NEW: Method to update component status
studentPaymentSchema.methods.updateComponentStatus = function() {
  // Update tuition status
  if (this.annualTuitionPayment.isPaid) {
    this.componentStatus.tuition = 'completed';
  } else {
    const paidTuitionPayments = this.tuitionMonthlyPayments.filter(payment => payment.status === 'paid');
    const overdueTuitionPayments = this.tuitionMonthlyPayments.filter(payment => payment.status === 'overdue');
    const partialTuitionPayments = this.tuitionMonthlyPayments.filter(payment => payment.status === 'partial');

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

  if (this.inscriptionFee.applicable) {
  this.componentStatus.inscriptionFee = this.inscriptionFee.isPaid ? 'completed' : 'pending';
} else {
  this.componentStatus.inscriptionFee = 'not_applicable';
}

  // Update transportation status
  if (this.transportation.using) {
    const paidTransportPayments = this.transportation.monthlyPayments.filter(payment => payment.status === 'paid');
    const overdueTransportPayments = this.transportation.monthlyPayments.filter(payment => payment.status === 'overdue');
    const partialTransportPayments = this.transportation.monthlyPayments.filter(payment => payment.status === 'partial');

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

// ✅ UPDATED: Method to update overall status
studentPaymentSchema.methods.updateOverallStatus = function() {
  this.updateComponentStatus();

  // Determine overall status based on component statuses
  const applicableStatuses = [];
  
  applicableStatuses.push(this.componentStatus.tuition);
  
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

// ✅ UPDATED: Method to calculate remaining amounts
studentPaymentSchema.methods.calculateRemainingAmounts = function() {
  this.remainingAmounts.tuition = this.totalAmounts.tuition - this.paidAmounts.tuition;
  this.remainingAmounts.uniform = this.totalAmounts.uniform - this.paidAmounts.uniform;
  this.remainingAmounts.transportation = this.totalAmounts.transportation - this.paidAmounts.transportation;
  this.remainingAmounts.inscriptionFee = (this.totalAmounts.inscriptionFee || 0) - (this.paidAmounts.inscriptionFee || 0);
  this.remainingAmounts.grandTotal = this.totalAmounts.grandTotal - this.paidAmounts.grandTotal;
  
  return this.remainingAmounts;
};

// ✅ UPDATED: Method to update payment statuses based on due dates
studentPaymentSchema.methods.updatePaymentStatuses = function(gracePeriod = 5) {
  const currentDate = new Date();
  
  // Update tuition payment statuses
  this.tuitionMonthlyPayments.forEach(payment => {
    if (payment.status === 'paid') return;
    
    const gracePeriodDate = new Date(payment.dueDate);
    gracePeriodDate.setDate(gracePeriodDate.getDate() + gracePeriod);
    
    if (currentDate > gracePeriodDate && payment.status === 'pending') {
      payment.status = 'overdue';
    }
  });

  // Update transportation payment statuses
  if (this.transportation.using) {
    this.transportation.monthlyPayments.forEach(payment => {
      if (payment.status === 'paid') return;
      
      const gracePeriodDate = new Date(payment.dueDate);
      gracePeriodDate.setDate(gracePeriodDate.getDate() + gracePeriod);
      
      if (currentDate > gracePeriodDate && payment.status === 'pending') {
        payment.status = 'overdue';
      }
    });
  }
  
  this.updateOverallStatus();
};

// ✅ NEW: Method to get total monthly payment amount
studentPaymentSchema.methods.getMonthlyPaymentAmount = function(month) {
  let totalMonthly = 0;
  
  // Add tuition monthly amount
  const tuitionPayment = this.tuitionMonthlyPayments.find(p => p.month === month);
  if (tuitionPayment) {
    totalMonthly += tuitionPayment.amount;
  }
  
  // Add transportation monthly amount if applicable
  if (this.transportation.using) {
    const transportPayment = this.transportation.monthlyPayments.find(p => p.month === month);
    if (transportPayment) {
      totalMonthly += transportPayment.amount;
    }
  }
  
  return totalMonthly;
};

module.exports = mongoose.model('StudentPayment', studentPaymentSchema);