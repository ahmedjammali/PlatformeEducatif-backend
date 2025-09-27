// models/Charge.js
const mongoose = require('mongoose');

const chargeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'utilities',           // Electricity, Water, Internet, Gas
      'equipment',          // Tables, Chairs, Computers, Educational materials
      'maintenance',        // Repairs, Painting, Plumbing
      'transportation',     // School bus, Fuel, Vehicle maintenance
      'supplies',          // Office supplies, Cleaning supplies, Food
      'services',          // Insurance, Legal, Accounting, Marketing
      'technology',        // Software licenses, Hardware, IT services
      'infrastructure',    // Building improvements, Security systems
      'events',           // School events, Ceremonies, Trips
      'emergency',        // Urgent repairs, Emergency purchases
      'other'             // Miscellaneous expenses
    ]
  },
  subCategory: {
    type: String,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'TND',
    enum: ['TND', 'USD', 'EUR']
  },
  purchaseDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  supplier: {
    name: {
      type: String,
      trim: true
    },
    contact: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    taxId: {
      type: String,
      trim: true
    }
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'installments'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partially_paid', 'overdue', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // For recurring charges
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringSettings: {
    frequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually'],
      required: function() {
        return this.isRecurring;
      }
    },
    nextDueDate: {
      type: Date,
      required: function() {
        return this.isRecurring;
      }
    },
    endDate: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  // Document attachments
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Budget tracking
  budgetCategory: {
    type: String,
    trim: true
  },
  approvalRequired: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  // Tax information
  taxInfo: {
    taxRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    taxAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    totalWithTax: {
      type: Number,
      min: 0
    }
  },
  // School reference
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Indexes for better performance
chargeSchema.index({ school: 1, category: 1 });
chargeSchema.index({ school: 1, purchaseDate: -1 });
chargeSchema.index({ school: 1, paymentStatus: 1 });
chargeSchema.index({ school: 1, isRecurring: 1 });

// Calculate total with tax before saving
chargeSchema.pre('save', function(next) {
  if (this.taxInfo && this.taxInfo.taxRate) {
    this.taxInfo.taxAmount = (this.amount * this.taxInfo.taxRate) / 100;
    this.taxInfo.totalWithTax = this.amount + this.taxInfo.taxAmount;
  } else {
    this.taxInfo.totalWithTax = this.amount;
  }
  next();
});

// Virtual for formatted amount
chargeSchema.virtual('formattedAmount').get(function() {
  return `${this.amount.toFixed(2)} ${this.currency}`;
});

// Virtual for days overdue (if applicable)
chargeSchema.virtual('daysOverdue').get(function() {
  if (this.paymentStatus === 'overdue') {
    const today = new Date();
    const purchaseDate = new Date(this.purchaseDate);
    const diffTime = Math.abs(today - purchaseDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Method to get subcategories based on category
chargeSchema.statics.getSubcategories = function(category) {
  const subcategories = {
    utilities: ['Electricity', 'Water', 'Internet', 'Phone', 'Gas', 'Waste Management'],
    equipment: ['Furniture', 'Computers', 'Printers', 'Projectors', 'Educational Tools', 'Sports Equipment'],
    maintenance: ['Building Repairs', 'Plumbing', 'Electrical', 'Painting', 'Cleaning', 'Landscaping'],
    transportation: ['Fuel', 'Vehicle Insurance', 'Maintenance', 'Registration', 'Parking'],
    supplies: ['Office Supplies', 'Cleaning Supplies', 'Food & Catering', 'Medical Supplies'],
    services: ['Insurance', 'Legal Services', 'Accounting', 'Marketing', 'Security Services'],
    technology: ['Software Licenses', 'Cloud Services', 'IT Support', 'Hardware Upgrades'],
    infrastructure: ['Building Improvements', 'Security Systems', 'HVAC', 'Lighting'],
    events: ['School Events', 'Ceremonies', 'Field Trips', 'Sports Events', 'Cultural Activities'],
    emergency: ['Urgent Repairs', 'Emergency Equipment', 'Crisis Management'],
    other: ['Miscellaneous', 'Donations', 'Awards', 'Gifts']
  };
  return subcategories[category] || [];
};

module.exports = mongoose.model('Charge', chargeSchema);