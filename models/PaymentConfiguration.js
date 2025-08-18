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
    default: function() {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const nextYear = currentYear + 1;
      return `${currentYear}-${nextYear}`;
    }
  },
  // Payment amounts for different class groups
  paymentAmounts: {
    école: { // 6eme, 5eme, 4eme, 3eme, 2nde, 1ere
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    },
    college: { // 9eme, 8eme, 7eme
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    },
    lycée: { // 4ᵉ année S, 3ᵉ année S, 2ᵉ année S, 1ʳᵉ année S
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

// Compound index to ensure one active configuration per school per academic year
paymentConfigurationSchema.index({ 
  school: 1, 
  academicYear: 1, 
  isActive: 1 
}, { 
  unique: true,
  partialFilterExpression: { isActive: true }
});

// Index for efficient queries
paymentConfigurationSchema.index({ school: 1, academicYear: 1 });
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

// Method to deactivate previous configurations
paymentConfigurationSchema.methods.deactivatePrevious = async function() {
  await this.constructor.updateMany(
    {
      school: this.school,
      academicYear: this.academicYear,
      _id: { $ne: this._id },
      isActive: true
    },
    { 
      isActive: false,
      updatedAt: new Date()
    }
  );
};

// Static method to get active configuration
paymentConfigurationSchema.statics.getActiveConfig = function(schoolId, academicYear) {
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