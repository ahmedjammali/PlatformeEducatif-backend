const mongoose = require('mongoose');

// Transaction history for caisse operations
const caisseTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['verse_caisse', 'transfert_banque', 'ajustement'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  reference: {
    type: String,
    trim: true
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  }
}, { _id: true });

// Daily caisse record
const caisseJournaliereSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  recettes: {
    inscriptionFee: { type: Number, default: 0 },
    tuition: { type: Number, default: 0 },
    uniform: { type: Number, default: 0 },
    transportation: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  depenses: {
    salaries: { type: Number, default: 0 },
    charges: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  soldeJournalier: {
    type: Number,
    default: 0
  },
  // Solde without transportation (for accumulation)
  soldeJournalierSansTransport: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Main Caisse Schema
const caisseSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    unique: true
  },
  academicYear: {
    type: String,
    required: true
  },
  
  // Transport tracking (from November 1st)
  transportStartDate: {
    type: Date,
    default: () => new Date('2025-11-01')
  },
  totalTransport: {
    type: Number,
    default: 0
  },
  
  // General balance (cumulative daily balances without transport + total transport - operations)
  soldeGeneral: {
    type: Number,
    default: 0
  },
  
  // Cumulative daily balances (without transport)
  totalAccumuleJournaliers: {
    type: Number,
    default: 0
  },
  
  // Daily records
  journaliers: [caisseJournaliereSchema],
  
  // Transaction history (verses and bank transfers)
  transactions: [caisseTransactionSchema],
  
  // Initialization flag
  initialized: {
    type: Boolean,
    default: false
  },
  
  initializationDate: {
    type: Date
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
caisseSchema.index({ school: 1 });
caisseSchema.index({ 'journaliers.date': 1 });
caisseSchema.index({ 'transactions.date': 1 });

// Methods
caisseSchema.methods.calculateDailyBalance = function(date) {
  const dailyRecord = this.journaliers.find(j => 
    j.date.toDateString() === new Date(date).toDateString()
  );
  
  if (!dailyRecord) return null;
  
  dailyRecord.soldeJournalier = dailyRecord.recettes.total - dailyRecord.depenses.total;
  dailyRecord.soldeJournalierSansTransport = 
    (dailyRecord.recettes.total - dailyRecord.recettes.transportation) - 
    dailyRecord.depenses.total;
  
  return dailyRecord;
};

caisseSchema.methods.updateGeneralBalance = function() {
  // Recalculate totalAccumuleJournaliers
  this.totalAccumuleJournaliers = this.journaliers.reduce(
    (sum, j) => sum + j.soldeJournalierSansTransport, 0
  );
  
  // Calculate solde general
  this.soldeGeneral = this.totalAccumuleJournaliers + this.totalTransport;
  
  // Subtract all transactions (verses add, transfers subtract)
  this.transactions.forEach(transaction => {
    if (transaction.type === 'verse_caisse') {
      this.soldeGeneral += transaction.amount;
    } else if (transaction.type === 'transfert_banque') {
      this.soldeGeneral -= transaction.amount;
    }
  });
  
  this.lastUpdated = new Date();
};

caisseSchema.methods.addTransaction = function(type, amount, recordedBy, description, reference) {
  const transaction = {
    type,
    amount: Math.abs(amount),
    date: new Date(),
    description,
    reference,
    recordedBy,
    balanceAfter: this.soldeGeneral
  };
  
  // Update balance based on transaction type
  if (type === 'verse_caisse') {
    this.soldeGeneral += Math.abs(amount);
  } else if (type === 'transfert_banque') {
    this.soldeGeneral -= Math.abs(amount);
  }
  
  transaction.balanceAfter = this.soldeGeneral;
  this.transactions.push(transaction);
  this.lastUpdated = new Date();
  
  return transaction;
};

caisseSchema.methods.getDailyRecords = function(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  
  return this.journaliers.filter(record => {
    const recordDate = new Date(record.date);
    if (start && recordDate < start) return false;
    if (end && recordDate > end) return false;
    return true;
  }).sort((a, b) => b.date - a.date);
};

module.exports = mongoose.model('Caisse', caisseSchema);