// Updated PaymentConfiguration Schema with Grade-specific pricing, Uniform, and Transportation

const mongoose = require('mongoose');

const paymentConfigurationSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
  },
  academicYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/, // Validates format like "2024-2025"
  },
  
gradeAmounts: {
  // ✅ UPDATED: Single Maternal grade
  'Maternal': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  
  // École grades (Primary) - unchanged
  '1ère année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '2ème année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '3ème année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '4ème année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '5ème année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '6ème année primaire': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  
  // Collège (Middle School) grades
  '7ème année': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '8ème année': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '9ème année': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  
  // Lycée (High School) grades
  '1ère année lycée': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '2ème année lycée': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '3ème année lycée': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  },
  '4ème année lycée': { 
    type: Number,
    required: true,
    min: [0, 'Payment amount cannot be negative']
  }
},

  // ✅ NEW: Uniform configuration
  uniform: {
    enabled: {
      type: Boolean,
      default: true
    },
    price: {
      type: Number,
      required: function() { return this.uniform.enabled; },
      min: [0, 'Uniform price cannot be negative'],
      default: 0
    },
    description: {
      type: String,
      trim: true,
      default: 'Uniforme scolaire complet'
    },
    isOptional: {
      type: Boolean,
      default: true // Students can choose whether to buy or not
    }
  },

  // ✅ NEW: Transportation configuration
  transportation: {
    enabled: {
      type: Boolean,
      default: true
    },
    tariffs: {
      close: {
        enabled: {
          type: Boolean,
          default: true
        },
        monthlyPrice: {
          type: Number,
          required: function() { return this.transportation.enabled && this.transportation.tariffs.close.enabled; },
          min: [0, 'Transportation price cannot be negative'],
          default: 0
        },
        description: {
          type: String,
          default: 'Transport scolaire - Zone proche'
        }
      },
      far: {
        enabled: {
          type: Boolean,
          default: true
        },
        monthlyPrice: {
          type: Number,
          required: function() { return this.transportation.enabled && this.transportation.tariffs.far.enabled; },
          min: [0, 'Transportation price cannot be negative'],
          default: 0
        },
        description: {
          type: String,
          default: 'Transport scolaire - Zone éloignée'
        }
      }
    },
    isOptional: {
      type: Boolean,
      default: true // Students can choose whether to use transportation or not
    }
  },

  // Payment schedule settings (same as before)
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
   inscriptionFee: {
    enabled: {
      type: Boolean,
      default: true
    },
    prices: {
      maternelleAndPrimaire: {
        type: Number,
        required: function() { return this.inscriptionFee.enabled; },
        min: [0, 'Inscription fee cannot be negative'],
        default: 0
      },
      collegeAndLycee: {
        type: Number,
        required: function() { return this.inscriptionFee.enabled; },
        min: [0, 'Inscription fee cannot be negative'],
        default: 0
      }
    },
    description: {
      type: String,
      trim: true,
      default: 'Frais d\'inscription'
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

// Indexes
paymentConfigurationSchema.index({ 
  school: 1, 
  academicYear: 1
}, { 
  unique: true
});

paymentConfigurationSchema.index({ school: 1 });
paymentConfigurationSchema.index({ academicYear: 1 });
paymentConfigurationSchema.index({ isActive: 1 });

// ✅ NEW: Helper method to get grade category
paymentConfigurationSchema.statics.getGradeCategory = function(grade) {
  const maternelleGrades = ['Maternal']; // ✅ UPDATED
  const primaireGrades = ['1ère année primaire', '2ème année primaire', '3ème année primaire', '4ème année primaire', '5ème année primaire', '6ème année primaire'];
  const secondaireGrades = ['7ème année', '8ème année', '9ème année', '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'];
  
  if (maternelleGrades.includes(grade)) return 'maternelle';
  if (primaireGrades.includes(grade)) return 'primaire';
  if (secondaireGrades.includes(grade)) return 'secondaire';
  
  return 'unknown';
};

// ✅ NEW: Method to get available grades list
paymentConfigurationSchema.statics.getAvailableGrades = function() {
  return [
    // Maternal
    'Maternal', // ✅ UPDATED
    // Primaire
    '1ère année primaire', '2ème année primaire', '3ème année primaire', 
    '4ème année primaire', '5ème année primaire', '6ème année primaire',
    // Collège + Lycée
    '7ème année', '8ème année', '9ème année', 
    '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'
  ];
};

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
    this.updatedBy = this.createdBy;
  }
  
  next();
});

// Method to get configuration for specific academic year
paymentConfigurationSchema.statics.getConfigForYear = function(schoolId, academicYear) {
  return this.findOne({
    school: schoolId,
    academicYear: academicYear,
    isActive: true
  }).populate('createdBy updatedBy', 'name email');
};

// ✅ NEW: Method to get payment amount for a specific grade
paymentConfigurationSchema.methods.getAmountForGrade = function(grade) {
  const availableGrades = this.constructor.getAvailableGrades();
  if (!availableGrades.includes(grade)) {
    throw new Error(`Invalid grade: ${grade}`);
  }
  return this.gradeAmounts[grade] || 0;
};

// ✅ NEW: Method to calculate total student cost
paymentConfigurationSchema.methods.calculateStudentTotalCost = function(grade, hasUniform = false, transportationType = null) {
  let total = 0;
  
  // Add tuition fees
  total += this.getAmountForGrade(grade);
  
  // Add uniform cost if selected
  if (hasUniform && this.uniform.enabled) {
    total += this.uniform.price;
  }
  
  // Add transportation cost if selected (monthly cost * total months)
  if (transportationType && this.transportation.enabled) {
    const transportCost = transportationType === 'close' 
      ? this.transportation.tariffs.close.monthlyPrice 
      : this.transportation.tariffs.far.monthlyPrice;
    
    total += (transportCost * this.paymentSchedule.totalMonths);
  }
  
  return total;
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

// Add this method to your PaymentConfiguration schema
paymentConfigurationSchema.methods.getInscriptionFeeForGradeCategory = function(gradeCategory) {
  if (!this.inscriptionFee.enabled) return 0;
  
  if (gradeCategory === 'maternelle' || gradeCategory === 'primaire') {
    return this.inscriptionFee.prices.maternelleAndPrimaire || 0;
  }
  
  if (gradeCategory === 'secondaire') {
    return this.inscriptionFee.prices.collegeAndLycee || 0;
  }
  
  return 0;
};

paymentConfigurationSchema.methods.getInscriptionFeeForGradeCategory = function(gradeCategory) {
  if (!this.inscriptionFee.enabled) return 0;
  
  if (gradeCategory === 'maternelle' || gradeCategory === 'primaire') {
    return this.inscriptionFee.prices.maternelleAndPrimaire;
  }
  
  if (gradeCategory === 'secondaire') {
    return this.inscriptionFee.prices.collegeAndLycee;
  }
  
  return 0;
};

module.exports = mongoose.model('PaymentConfiguration', paymentConfigurationSchema);