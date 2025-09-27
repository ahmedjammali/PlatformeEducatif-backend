// models/OuvrierFinancialInfo.js
const mongoose = require('mongoose');

const ouvrierFinancialInfoSchema = new mongoose.Schema({
  ouvrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  position: {
    type: String,
    enum: ['sécurité', 'chef', 'nettoyeur', 'cuisinier', 'surveillant', 'maintenance', 'autre'],
    required: true
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
ouvrierFinancialInfoSchema.index({ ouvrier: 1, school: 1 });
ouvrierFinancialInfoSchema.index({ school: 1, isActive: 1 });
ouvrierFinancialInfoSchema.index({ position: 1, school: 1 });

module.exports = mongoose.model('OuvrierFinancialInfo', ouvrierFinancialInfoSchema);