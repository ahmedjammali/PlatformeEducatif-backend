// routes/caisseRoutes.js
const express = require('express');
const router = express.Router();

const {
  initializeCaisse,
  deleteCaisse,
  getCaisseDashboard,
  verseCaisse,
  transfertBanque,
  getTransactionHistory,
  getDailyHistory,
  updateCaisse
} = require('../controllers/caisseController');

const {
  authenticate,
  isAdminOrHigher,
  isCaissierOrHigher
} = require('../middleware/auth');

// Validation middleware
const validateInitialization = (req, res, next) => {
  const { academicYear } = req.body;
  
  if (!academicYear) {
    return res.status(400).json({ 
      success: false,
      message: 'L\'année académique est requise' 
    });
  }

  next();
};

const validateTransaction = (req, res, next) => {
  const { amount } = req.body;
  
  if (!amount) {
    return res.status(400).json({ 
      success: false,
      message: 'Le montant est requis' 
    });
  }

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ 
      success: false,
      message: 'Le montant doit être un nombre positif' 
    });
  }

  next();
};

const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && isNaN(Date.parse(startDate))) {
    return res.status(400).json({ 
      success: false,
      message: 'Format de date de début invalide' 
    });
  }

  if (endDate && isNaN(Date.parse(endDate))) {
    return res.status(400).json({ 
      success: false,
      message: 'Format de date de fin invalide' 
    });
  }

  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ 
      success: false,
      message: 'La date de début doit être antérieure à la date de fin' 
    });
  }

  next();
};

const validateDeleteConfirmation = (req, res, next) => {
  const { confirm } = req.body;
  
  if (confirm !== 'DELETE_CAISSE') {
    return res.status(400).json({ 
      success: false,
      message: 'Veuillez confirmer la suppression en envoyant { "confirm": "DELETE_CAISSE" }' 
    });
  }

  next();
};

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/caisse/initialize
 * @desc    Initialize caisse for a school (one time only)
 * @access  Private (Admin, Super Admin)
 * @body    { academicYear: String }
 */
router.post(
  '/initialize',
  isAdminOrHigher,
  validateInitialization,
  initializeCaisse
);

/**
 * @route   DELETE /api/caisse/delete
 * @desc    Delete caisse to allow reinitialization
 * @access  Private (Admin, Super Admin)
 * @body    { confirm: "DELETE_CAISSE" }
 */
router.delete(
  '/delete',
  isAdminOrHigher,
  validateDeleteConfirmation,
  deleteCaisse
);

/**
 * @route   GET /api/caisse/dashboard
 * @desc    Get caisse dashboard data (daily, transport, general)
 * @access  Private (Caissier, Admin, Super Admin)
 * @query   date (optional) - Format: YYYY-MM-DD
 */
router.get(
  '/dashboard',
  getCaisseDashboard
);

/**
 * @route   POST /api/caisse/verse
 * @desc    Record a cash deposit (verse en caisse)
 * @access  Private (Admin, Super Admin)
 * @body    { amount: Number, description: String, reference: String }
 */
router.post(
  '/verse',
  isAdminOrHigher,
  validateTransaction,
  verseCaisse
);

/**
 * @route   POST /api/caisse/transfert
 * @desc    Record a bank transfer (transfert banque)
 * @access  Private (Admin, Super Admin)
 * @body    { amount: Number, description: String, reference: String }
 */
router.post(
  '/transfert',
  isAdminOrHigher,
  validateTransaction,
  transfertBanque
);

/**
 * @route   GET /api/caisse/transactions
 * @desc    Get transaction history with filters
 * @access  Private (Caissier, Admin, Super Admin)
 * @query   startDate, endDate, type, page, limit
 */
router.get(
  '/transactions',
  validateDateRange,
  getTransactionHistory
);

/**
 * @route   GET /api/caisse/daily-history
 * @desc    Get daily records history
 * @access  Private (Caissier, Admin, Super Admin)
 * @query   startDate, endDate, page, limit
 */
router.get(
  '/daily-history',
  validateDateRange,
  getDailyHistory
);

/**
 * @route   PUT /api/caisse/update
 * @desc    Update/recalculate caisse (manual refresh)
 * @access  Private (Admin, Super Admin)
 */
router.put(
  '/update',
  isAdminOrHigher,
  updateCaisse
);

module.exports = router;