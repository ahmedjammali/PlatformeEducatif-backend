// models/ChargeCategory.js
const mongoose = require('mongoose');

const chargeCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  icon: {
    type: String, // FontAwesome icon class or emoji
    default: '📄'
  },
  color: {
    type: String,
    default: '#6B7280' // Tailwind gray-500
  },
  isSystemDefined: {
    type: Boolean,
    default: false
  },
  subcategories: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  budgetLimit: {
    monthly: {
      type: Number,
      min: 0
    },
    quarterly: {
      type: Number,
      min: 0
    },
    yearly: {
      type: Number,
      min: 0
    }
  },
  requiresApproval: {
    type: Boolean,
    default: false
  },
  approvalThreshold: {
    type: Number,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: function() {
      return !this.isSystemDefined;
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Default system categories
chargeCategorySchema.statics.createSystemCategories = async function() {
  const systemCategories = [
    {
      name: 'utilities',
      description: 'Basic utilities and services',
      icon: '⚡',
      color: '#F59E0B',
      isSystemDefined: true,
      subcategories: [
        { name: 'Electricity', description: 'Electrical bills and services' },
        { name: 'Water', description: 'Water bills and plumbing' },
        { name: 'Internet', description: 'Internet and telecommunications' },
        { name: 'Gas', description: 'Gas utilities' },
        { name: 'Waste Management', description: 'Garbage and recycling services' }
      ]
    },
    {
      name: 'equipment',
      description: 'School equipment and furniture',
      icon: '🖥️',
      color: '#3B82F6',
      isSystemDefined: true,
      subcategories: [
        { name: 'Computers', description: 'Computers and laptops' },
        { name: 'Furniture', description: 'Desks, chairs, and classroom furniture' },
        { name: 'Projectors', description: 'Projectors and display equipment' },
        { name: 'Educational Tools', description: 'Teaching aids and materials' },
        { name: 'Sports Equipment', description: 'Sports and recreation equipment' }
      ]
    },
    {
      name: 'maintenance',
      description: 'Building and equipment maintenance',
      icon: '🔧',
      color: '#10B981',
      isSystemDefined: true,
      subcategories: [
        { name: 'Building Repairs', description: 'General building maintenance' },
        { name: 'Plumbing', description: 'Plumbing repairs and maintenance' },
        { name: 'Electrical', description: 'Electrical repairs and installations' },
        { name: 'Painting', description: 'Painting and decorating' },
        { name: 'Landscaping', description: 'Garden and outdoor maintenance' }
      ]
    },
    {
      name: 'supplies',
      description: 'Office and educational supplies',
      icon: '📚',
      color: '#8B5CF6',
      isSystemDefined: true,
      subcategories: [
        { name: 'Office Supplies', description: 'Stationery and office materials' },
        { name: 'Cleaning Supplies', description: 'Cleaning materials and chemicals' },
        { name: 'Food & Catering', description: 'Cafeteria and event catering' },
        { name: 'Medical Supplies', description: 'First aid and medical equipment' }
      ]
    },
    {
      name: 'services',
      description: 'Professional services',
      icon: '🏢',
      color: '#EF4444',
      isSystemDefined: true,
      subcategories: [
        { name: 'Insurance', description: 'Insurance policies and coverage' },
        { name: 'Legal Services', description: 'Legal consultation and services' },
        { name: 'Accounting', description: 'Accounting and financial services' },
        { name: 'Marketing', description: 'Marketing and advertising' },
        { name: 'Security Services', description: 'Security and surveillance' }
      ]
    }
  ];

  for (const category of systemCategories) {
    await this.findOneAndUpdate(
      { name: category.name, isSystemDefined: true },
      category,
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('ChargeCategory', chargeCategorySchema);