// Fixed PaymentConfiguration Schema

const mongoose = require('mongoose');

const paymentConfigurationSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  academicYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/, // Validates format like "2024-2025"
  },
  // Payment amounts for different class groups
  paymentAmounts: {
    école: { 
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    },
    college: { 
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    },
    lycée: { 
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    }
  },
  // Payment schedule settings
  paymentSchedule: {
    startMonth: {
      type: Number,
      default: 9, // September
      min: [1, 'Month must be between 1 and 12'],
      max: [12, 'Month must be between 1 and 12']
    },
    endMonth: {
      type: Number,
      default: 5, // May
      min: [1, 'Month must be between 1 and 12'],
      max: [12, 'Month must be between 1 and 12']
    },
    totalMonths: {
      type: Number,
      default: 9,
      min: [1, 'Total months must be at least 1'],
      max: [12, 'Total months cannot exceed 12']
    }
  },
  // Grace period for late payments (in days)
  gracePeriod: {
    type: Number,
    default: 5,
    min: [0, 'Grace period cannot be negative'],
    max: [30, 'Grace period cannot exceed 30 days']
  },
  // Discount settings for annual payments
  annualPaymentDiscount: {
    enabled: {
      type: Boolean,
      default: false
    },
    percentage: {
      type: Number,
      default: 0,
      min: [0, 'Discount percentage cannot be negative'],
      max: [100, 'Discount percentage cannot exceed 100%']
    },
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative']
    }
  },
  isActive: {
    type: Boolean,
    default: true
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

// ✅ FIXED: Allow multiple configurations per school for different academic years
// Remove the unique constraint that was preventing multiple configs
paymentConfigurationSchema.index({ 
  school: 1, 
  academicYear: 1
}, { 
  unique: true  // ✅ One config per school per academic year (without isActive constraint)
});

// Additional indexes for efficient queries
paymentConfigurationSchema.index({ school: 1 });
paymentConfigurationSchema.index({ academicYear: 1 });
paymentConfigurationSchema.index({ isActive: 1 });

// Virtual to calculate total months automatically
paymentConfigurationSchema.virtual('calculatedTotalMonths').get(function() {
  let months = this.paymentSchedule.endMonth - this.paymentSchedule.startMonth + 1;
  if (months <= 0) {
    months += 12; // Handle year transition (e.g., Sept to May)
  }
  return months;
});

// Pre-save middleware to auto-calculate total months
paymentConfigurationSchema.pre('save', function(next) {
  // Auto-calculate total months if not explicitly set
  if (this.paymentSchedule && this.paymentSchedule.startMonth && this.paymentSchedule.endMonth) {
    let months = this.paymentSchedule.endMonth - this.paymentSchedule.startMonth + 1;
    if (months <= 0) {
      months += 12; // Handle year transition
    }
    this.paymentSchedule.totalMonths = months;
  }
  
  // Set updatedBy if this is an update
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.createdBy; // You might want to pass this from the controller
  }
  
  next();
});

// ✅ UPDATED: Method to get configuration for specific academic year
paymentConfigurationSchema.statics.getConfigForYear = function(schoolId, academicYear) {
  return this.findOne({
    school: schoolId,
    academicYear: academicYear,
    isActive: true
  }).populate('createdBy updatedBy', 'name email');
};

// Method to validate payment schedule consistency
paymentConfigurationSchema.methods.validateSchedule = function() {
  const { startMonth, endMonth, totalMonths } = this.paymentSchedule;
  
  let calculatedMonths = endMonth - startMonth + 1;
  if (calculatedMonths <= 0) {
    calculatedMonths += 12;
  }
  
  return calculatedMonths === totalMonths;
};

// Method to get payment amount for a specific class group
paymentConfigurationSchema.methods.getAmountForClassGroup = function(classGroup) {
  if (!['école', 'college', 'lycée'].includes(classGroup)) {
    throw new Error('Invalid class group');
  }
  return this.paymentAmounts[classGroup];
};

module.exports = mongoose.model('PaymentConfiguration', paymentConfigurationSchema);