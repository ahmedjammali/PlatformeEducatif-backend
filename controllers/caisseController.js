// controllers/caisseController.js - DATE ONLY VERSION WITH DELETE
const Caisse = require('../models/Caisse');
const StudentPayment = require('../models/StudentPayment');
const Charge = require('../models/Charge');
const TeacherAdminSalary = require('../models/TeacherAdminSalary');
const { calculateDateRangePaidAmountsFromHistory } = require('./incomeAnalyticsController');

/**
 * Helper function to format date as YYYY-MM-DD
 */
function formatDateOnly(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Initialize or get caisse for a school
 */
const initializeCaisse = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { academicYear } = req.body;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Année académique requise'
      });
    }

    // Check if caisse already exists
    let caisse = await Caisse.findOne({ school: schoolId });

    if (caisse) {
      return res.status(400).json({
        success: false,
        message: 'La caisse existe déjà pour cette école. Utilisez l\'endpoint /delete pour réinitialiser.'
      });
    }

    // Create new caisse
    caisse = new Caisse({
      school: schoolId,
      academicYear,
      transportStartDate: new Date('2025-11-01'),
      initialized: true,
      initializationDate: new Date()
    });

    // Calculate initial transportation total (from November 1st)
    const transportFilter = {
      school: schoolId,
      'transportation.using': true
    };

    const studentPayments = await StudentPayment.find(transportFilter).lean();
    
    let totalTransport = 0;
    const transportStartDate = new Date('2025-11-01');
    
    studentPayments.forEach(payment => {
      if (payment.transportation?.monthlyPayments) {
        payment.transportation.monthlyPayments.forEach(monthly => {
          if (monthly.paymentHistory && monthly.paymentHistory.length > 0) {
            monthly.paymentHistory.forEach(transaction => {
              const transactionDate = new Date(transaction.paymentDate);
              if (transactionDate >= transportStartDate) {
                totalTransport += transaction.amount;
              }
            });
          }
        });
      }
    });

    caisse.totalTransport = totalTransport;

    // Calculate today's income using DATE ONLY format (no time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Format as YYYY-MM-DD (same date for both start and end)
    const todayDateOnly = formatDateOnly(today);

    // Get today's income
    const allPayments = await StudentPayment.find({ school: schoolId }).lean();
    
    let todayIncome = {
      inscriptionFee: 0,
      tuition: 0,
      uniform: 0,
      transportation: 0
    };

    allPayments.forEach(payment => {
      const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(
        payment, 
        todayDateOnly,
        todayDateOnly
      );
      
      todayIncome.inscriptionFee += dateRangePaidAmounts.inscriptionFee;
      todayIncome.tuition += dateRangePaidAmounts.tuition;
      todayIncome.uniform += dateRangePaidAmounts.uniform;
      todayIncome.transportation += dateRangePaidAmounts.transportation;
    });

    const totalRecettes = todayIncome.inscriptionFee + todayIncome.tuition + 
                          todayIncome.uniform + todayIncome.transportation;

    // Get today's expenses (charges)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const charges = await Charge.find({
      school: schoolId,
      date: { $gte: today, $lt: tomorrow }
    });

    const totalCharges = charges.reduce((sum, charge) => sum + charge.montant, 0);

    // Get today's salary payments
    const salaries = await TeacherAdminSalary.find({
      school: schoolId
    }).lean();

    let totalSalaries = 0;
    salaries.forEach(salary => {
      if (salary.paymentSchedule && Array.isArray(salary.paymentSchedule)) {
        salary.paymentSchedule.forEach(payment => {
          if (payment.paidDate) {
            const paidDate = new Date(payment.paidDate);
            if (paidDate >= today && paidDate < tomorrow) {
              totalSalaries += payment.paidAmount || 0;
            }
          }
        });
      }
    });

    const totalDepenses = totalCharges + totalSalaries;

    // Create today's daily record
    const dailyRecord = {
      date: today,
      recettes: {
        inscriptionFee: todayIncome.inscriptionFee,
        tuition: todayIncome.tuition,
        uniform: todayIncome.uniform,
        transportation: todayIncome.transportation,
        total: totalRecettes
      },
      depenses: {
        salaries: totalSalaries,
        charges: totalCharges,
        total: totalDepenses
      },
      soldeJournalier: totalRecettes - totalDepenses,
      soldeJournalierSansTransport: (totalRecettes - todayIncome.transportation) - totalDepenses
    };

    caisse.journaliers.push(dailyRecord);
    caisse.totalAccumuleJournaliers = dailyRecord.soldeJournalierSansTransport;
    caisse.soldeGeneral = caisse.totalAccumuleJournaliers + caisse.totalTransport;

    await caisse.save();

    res.status(201).json({
      success: true,
      message: 'Caisse initialisée avec succès',
      data: caisse
    });

  } catch (error) {
    console.error('Error in initializeCaisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'initialisation de la caisse',
      error: error.message
    });
  }
};

/**
 * Delete caisse to allow reinitialization
 */
const deleteCaisse = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { confirm } = req.body;

    // Require explicit confirmation
    if (confirm !== 'DELETE_CAISSE') {
      return res.status(400).json({
        success: false,
        message: 'Veuillez confirmer la suppression en envoyant { "confirm": "DELETE_CAISSE" }'
      });
    }

    const caisse = await Caisse.findOne({ school: schoolId });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Aucune caisse trouvée pour cette école'
      });
    }

    // Store some info before deletion for the response
    const deletedInfo = {
      academicYear: caisse.academicYear,
      soldeGeneral: caisse.soldeGeneral,
      totalTransactions: caisse.transactions.length,
      totalDailyRecords: caisse.journaliers.length,
      deletedAt: new Date()
    };

    // Delete the caisse
    await Caisse.deleteOne({ school: schoolId });

    res.json({
      success: true,
      message: 'Caisse supprimée avec succès. Vous pouvez maintenant réinitialiser.',
      data: deletedInfo
    });

  } catch (error) {
    console.error('Error in deleteCaisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la caisse',
      error: error.message
    });
  }
};

/**
 * Get caisse dashboard data
 */
const getCaisseDashboard = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { date } = req.query;

    let caisse = await Caisse.findOne({ school: schoolId })
      .populate('transactions.recordedBy', 'name email');

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée. Veuillez initialiser la caisse.'
      });
    }

    // Update today's data if needed
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    await updateDailyRecord(caisse, targetDate, schoolId);

    // Get today's record
    const todayRecord = caisse.journaliers.find(j => 
      j.date.toDateString() === targetDate.toDateString()
    );

    // Get recent transactions (last 10)
    const recentTransactions = caisse.transactions
      .slice(-10)
      .reverse()
      .map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        date: t.date,
        description: t.description,
        reference: t.reference,
        recordedBy: t.recordedBy,
        balanceAfter: t.balanceAfter
      }));

    res.json({
      success: true,
      data: {
        caisseJournaliere: todayRecord || {
          date: targetDate,
          recettes: { inscriptionFee: 0, tuition: 0, uniform: 0, transportation: 0, total: 0 },
          depenses: { salaries: 0, charges: 0, total: 0 },
          soldeJournalier: 0,
          soldeJournalierSansTransport: 0
        },
        caisseTransport: {
          startDate: caisse.transportStartDate,
          totalTransport: caisse.totalTransport
        },
        caisseGenerale: {
          totalAccumuleJournaliers: caisse.totalAccumuleJournaliers,
          totalTransport: caisse.totalTransport,
          soldeGeneral: caisse.soldeGeneral
        },
        recentTransactions,
        lastUpdated: caisse.lastUpdated
      }
    });

  } catch (error) {
    console.error('Error in getCaisseDashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du tableau de bord',
      error: error.message
    });
  }
};

/**
 * Add verse en caisse transaction
 */
const verseCaisse = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const userId = req.user._id;
    const { amount, description, reference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }

    let caisse = await Caisse.findOne({ school: schoolId });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    const transaction = caisse.addTransaction(
      'verse_caisse',
      amount,
      userId,
      description,
      reference
    );

    await caisse.save();

    res.json({
      success: true,
      message: 'Versement enregistré avec succès',
      data: {
        transaction,
        newBalance: caisse.soldeGeneral
      }
    });

  } catch (error) {
    console.error('Error in verseCaisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du versement',
      error: error.message
    });
  }
};

/**
 * Add bank transfer transaction
 */
const transfertBanque = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const userId = req.user._id;
    const { amount, description, reference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }

    let caisse = await Caisse.findOne({ school: schoolId });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    if (caisse.soldeGeneral < amount) {
      return res.status(400).json({
        success: false,
        message: 'Solde insuffisant pour effectuer ce transfert'
      });
    }

    const transaction = caisse.addTransaction(
      'transfert_banque',
      amount,
      userId,
      description,
      reference
    );

    await caisse.save();

    res.json({
      success: true,
      message: 'Transfert bancaire enregistré avec succès',
      data: {
        transaction,
        newBalance: caisse.soldeGeneral
      }
    });

  } catch (error) {
    console.error('Error in transfertBanque:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du transfert bancaire',
      error: error.message
    });
  }
};

/**
 * Get transaction history with filters
 */
const getTransactionHistory = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { startDate, endDate, type, page = 1, limit = 50 } = req.query;

    let caisse = await Caisse.findOne({ school: schoolId })
      .populate('transactions.recordedBy', 'name email');

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    let transactions = [...caisse.transactions];

    // Apply filters
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      transactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        if (start && tDate < start) return false;
        if (end && tDate > end) return false;
        return true;
      });
    }

    // Sort by date descending
    transactions.sort((a, b) => b.date - a.date);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          total: transactions.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(transactions.length / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error in getTransactionHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
};

/**
 * Get daily records history
 */
const getDailyHistory = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    let caisse = await Caisse.findOne({ school: schoolId });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    const dailyRecords = caisse.getDailyRecords(startDate, endDate);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRecords = dailyRecords.slice(startIndex, endIndex);

    // Calculate totals
    const totals = dailyRecords.reduce((acc, record) => ({
      recettes: acc.recettes + record.recettes.total,
      depenses: acc.depenses + record.depenses.total,
      solde: acc.solde + record.soldeJournalier
    }), { recettes: 0, depenses: 0, solde: 0 });

    res.json({
      success: true,
      data: {
        dailyRecords: paginatedRecords,
        totals,
        pagination: {
          total: dailyRecords.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(dailyRecords.length / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error in getDailyHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique journalier',
      error: error.message
    });
  }
};

/**
 * Update caisse (recalculate everything)
 */
const updateCaisse = async (req, res) => {
  try {
    const schoolId = req.user.school;

    let caisse = await Caisse.findOne({ school: schoolId });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    // Update today's record
    await updateDailyRecord(caisse, new Date(), schoolId);

    res.json({
      success: true,
      message: 'Caisse mise à jour avec succès',
      data: caisse
    });

  } catch (error) {
    console.error('Error in updateCaisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la caisse',
      error: error.message
    });
  }
};

/**
 * Helper function using DATE ONLY format (no time)
 */
async function updateDailyRecord(caisse, date, schoolId) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  const targetDateOnly = formatDateOnly(targetDate);

  // Get income for the date
  const allPayments = await StudentPayment.find({ school: schoolId }).lean();
  
  let dayIncome = {
    inscriptionFee: 0,
    tuition: 0,
    uniform: 0,
    transportation: 0
  };

  allPayments.forEach(payment => {
    const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(
      payment, 
      targetDateOnly,
      targetDateOnly
    );
    
    dayIncome.inscriptionFee += dateRangePaidAmounts.inscriptionFee;
    dayIncome.tuition += dateRangePaidAmounts.tuition;
    dayIncome.uniform += dateRangePaidAmounts.uniform;
    dayIncome.transportation += dateRangePaidAmounts.transportation;
  });

  const totalRecettes = dayIncome.inscriptionFee + dayIncome.tuition + 
                        dayIncome.uniform + dayIncome.transportation;

  // Get expenses for the date
  const tomorrow = new Date(targetDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const charges = await Charge.find({
    school: schoolId,
    date: { $gte: targetDate, $lt: tomorrow }
  });

  const totalCharges = charges.reduce((sum, charge) => sum + charge.montant, 0);

  const salaries = await TeacherAdminSalary.find({
    school: schoolId
  }).lean();

  let totalSalaries = 0;
  salaries.forEach(salary => {
    if (salary.paymentSchedule && Array.isArray(salary.paymentSchedule)) {
      salary.paymentSchedule.forEach(payment => {
        if (payment.paidDate) {
          const paidDate = new Date(payment.paidDate);
          if (paidDate >= targetDate && paidDate < tomorrow) {
            totalSalaries += payment.paidAmount || 0;
          }
        }
      });
    }
  });

  const totalDepenses = totalCharges + totalSalaries;

  // Update or create daily record
  const existingIndex = caisse.journaliers.findIndex(j => 
    j.date.toDateString() === targetDate.toDateString()
  );

  const dailyRecord = {
    date: targetDate,
    recettes: {
      inscriptionFee: dayIncome.inscriptionFee,
      tuition: dayIncome.tuition,
      uniform: dayIncome.uniform,
      transportation: dayIncome.transportation,
      total: totalRecettes
    },
    depenses: {
      salaries: totalSalaries,
      charges: totalCharges,
      total: totalDepenses
    },
    soldeJournalier: totalRecettes - totalDepenses,
    soldeJournalierSansTransport: (totalRecettes - dayIncome.transportation) - totalDepenses
  };

  if (existingIndex >= 0) {
    caisse.journaliers[existingIndex] = dailyRecord;
  } else {
    caisse.journaliers.push(dailyRecord);
  }

  // Update transport total from November 1st
  const transportStartDate = caisse.transportStartDate || new Date('2025-11-01');
  let totalTransport = 0;
  
  const transportFilter = {
    school: schoolId,
    'transportation.using': true
  };

  const studentPayments = await StudentPayment.find(transportFilter).lean();
  
  studentPayments.forEach(payment => {
    if (payment.transportation?.monthlyPayments) {
      payment.transportation.monthlyPayments.forEach(monthly => {
        if (monthly.paymentHistory && monthly.paymentHistory.length > 0) {
          monthly.paymentHistory.forEach(transaction => {
            const transactionDate = new Date(transaction.paymentDate);
            if (transactionDate >= transportStartDate) {
              totalTransport += transaction.amount;
            }
          });
        }
      });
    }
  });

  caisse.totalTransport = totalTransport;

  // Update general balance
  caisse.updateGeneralBalance();

  await caisse.save();
  
  return caisse;
}

module.exports = {
  initializeCaisse,
  deleteCaisse,
  getCaisseDashboard,
  verseCaisse,
  transfertBanque,
  getTransactionHistory,
  getDailyHistory,
  updateCaisse
};