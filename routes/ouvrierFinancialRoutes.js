// routes/ouvrierFinancialRoutes.js
const express = require('express');
const router = express.Router();

const {
  createOuvrierFinancialInfo,
  getAllOuvriersFinancial,
  getOuvrierFinancialInfo,
  updateOuvrierFinancialInfo,
  deleteOuvrierFinancialInfo
} = require('../controllers/ouvrierFinancialController');

const {
  getAllPaymentDossiers,
  getOuvrierPaymentDossiers,
  getPaymentDossier,
  updatePaymentDossier,
  bulkUpdatePaymentDossiers,
  getPaymentStatistics
} = require('../controllers/ouvrierPaymentController');

const {
  authenticate,
  isAdminOrHigher
} = require('../middleware/auth');

// Validation middleware
const validateOuvrierFinancialCreation = (req, res, next) => {
  const {
    ouvrierId,
    position,
    contractType,
    monthlySalary,
    hourlyRate,
    contractualHoursPerMonth,
    startDate
  } = req.body;
  
  if (!ouvrierId || !position || !contractType || !startDate) {
    return res.status(400).json({
      message: 'Ouvrier ID, position, contract type, and start date are required'
    });
  }

  const validPositions = ['sécurité', 'chef', 'nettoyeur', 'cuisinier', 'surveillant', 'maintenance', 'autre'];
  if (!validPositions.includes(position)) {
    return res.status(400).json({
      message: 'Invalid position. Must be one of: ' + validPositions.join(', ')
    });
  }

  const validContractTypes = ['monthly', 'hourly'];
  if (!validContractTypes.includes(contractType)) {
    return res.status(400).json({
      message: 'Invalid contract type. Must be monthly or hourly'
    });
  }

  if (contractType === 'monthly' && !monthlySalary) {
    return res.status(400).json({
      message: 'Monthly salary is required for monthly contract type'
    });
  }

  if (contractType === 'hourly' && (!hourlyRate || !contractualHoursPerMonth)) {
    return res.status(400).json({
      message: 'Hourly rate and contractual hours per month are required for hourly contract type'
    });
  }

  if (monthlySalary && monthlySalary < 0) {
    return res.status(400).json({
      message: 'Monthly salary must be a positive number'
    });
  }

  if (hourlyRate && hourlyRate < 0) {
    return res.status(400).json({
      message: 'Hourly rate must be a positive number'
    });
  }

  if (contractualHoursPerMonth && contractualHoursPerMonth < 0) {
    return res.status(400).json({
      message: 'Contractual hours per month must be a positive number'
    });
  }

  next();
};

const validatePaymentDossierUpdate = (req, res, next) => {
  const { hoursWorked, finalAmount, status } = req.body;
  
  if (hoursWorked !== undefined && hoursWorked < 0) {
    return res.status(400).json({
      message: 'Hours worked must be a positive number'
    });
  }

  if (finalAmount !== undefined && finalAmount < 0) {
    return res.status(400).json({
      message: 'Final amount must be a positive number'
    });
  }

  if (status && !['unpaid', 'paid', 'partial'].includes(status)) {
    return res.status(400).json({
      message: 'Invalid status. Must be unpaid, paid, or partial'
    });
  }

  next();
};

const validateBulkUpdate = (req, res, next) => {
  const { dossierIds, updates } = req.body;
  
  if (!dossierIds || !Array.isArray(dossierIds) || dossierIds.length === 0) {
    return res.status(400).json({
      message: 'Dossier IDs array is required and must not be empty'
    });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      message: 'Updates object is required and must not be empty'
    });
  }

  if (updates.status && !['unpaid', 'paid', 'partial'].includes(updates.status)) {
    return res.status(400).json({
      message: 'Invalid status. Must be unpaid, paid, or partial'
    });
  }

  next();
};

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(isAdminOrHigher);

// Ouvrier Financial Info Routes
router.post('/', validateOuvrierFinancialCreation, createOuvrierFinancialInfo);
router.get('/', getAllOuvriersFinancial);
router.get('/:ouvrierId', getOuvrierFinancialInfo);
router.put('/:ouvrierId', updateOuvrierFinancialInfo);
router.delete('/:ouvrierId', deleteOuvrierFinancialInfo);

// Payment Dossiers Routes
router.get('/dossiers/all', getAllPaymentDossiers);
router.get('/dossiers/statistics', getPaymentStatistics);
router.get('/dossiers/ouvrier/:ouvrierId', getOuvrierPaymentDossiers);
router.get('/dossiers/:dossierId', getPaymentDossier);
router.put('/dossiers/:dossierId', validatePaymentDossierUpdate, updatePaymentDossier);
router.put('/dossiers/bulk/update', validateBulkUpdate, bulkUpdatePaymentDossiers);

module.exports = router;