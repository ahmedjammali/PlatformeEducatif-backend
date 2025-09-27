// routes/teacherFinancialRoutes.js
const express = require('express');
const router = express.Router();

const {
  createTeacherFinancialInfo,
  getAllTeachersFinancial,
  getTeacherFinancialInfo,
  updateTeacherFinancialInfo,
  deleteTeacherFinancialInfo
} = require('../controllers/teacherFinancialController');

const {
  getAllPaymentDossiers,
  getTeacherPaymentDossiers,
  getPaymentDossier,
  updatePaymentDossier,
  bulkUpdatePaymentDossiers,
  getPaymentStatistics
} = require('../controllers/teacherPaymentController');

const {
  authenticate,
  isAdminOrHigher
} = require('../middleware/auth');

// Validation middleware
const validateTeacherFinancialCreation = (req, res, next) => {
  const {
    teacherId,
    contractType,
    monthlySalary,
    hourlyRate,
    contractualHoursPerMonth,
    startDate,
    endDate,
    contractMonths
  } = req.body;
  
  // Required fields validation
  if (!teacherId || !contractType || !startDate || !endDate) {
    return res.status(400).json({
      message: 'Teacher ID, contract type, start date, and end date are required'
    });
  }

  // Contract type validation
  const validContractTypes = ['monthly', 'hourly'];
  if (!validContractTypes.includes(contractType)) {
    return res.status(400).json({
      message: 'Invalid contract type. Must be monthly or hourly'
    });
  }

  // Contract months validation
  if (!contractMonths || !Array.isArray(contractMonths) || contractMonths.length === 0) {
    return res.status(400).json({
      message: 'Contract months array is required and cannot be empty'
    });
  }

  // Validate month values
  const invalidMonths = contractMonths.filter(month => 
    !Number.isInteger(month) || month < 1 || month > 12
  );
  if (invalidMonths.length > 0) {
    return res.status(400).json({
      message: 'All contract months must be valid integers between 1 and 12'
    });
  }

  // Date validation
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      message: 'Invalid date format for start date or end date'
    });
  }

  if (start >= end) {
    return res.status(400).json({
      message: 'End date must be after start date'
    });
  }

  // Contract type specific validation
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

  // Numeric validation
  if (monthlySalary && (typeof monthlySalary !== 'number' || monthlySalary < 0)) {
    return res.status(400).json({
      message: 'Monthly salary must be a positive number'
    });
  }

  if (hourlyRate && (typeof hourlyRate !== 'number' || hourlyRate < 0)) {
    return res.status(400).json({
      message: 'Hourly rate must be a positive number'
    });
  }

  if (contractualHoursPerMonth && (typeof contractualHoursPerMonth !== 'number' || contractualHoursPerMonth < 0)) {
    return res.status(400).json({
      message: 'Contractual hours per month must be a positive number'
    });
  }

  next();
};

const validateTeacherFinancialUpdate = (req, res, next) => {
  const {
    contractType,
    monthlySalary,
    hourlyRate,
    contractualHoursPerMonth,
    endDate,
    contractMonths
  } = req.body;

  // Contract type validation
  if (contractType && !['monthly', 'hourly'].includes(contractType)) {
    return res.status(400).json({
      message: 'Invalid contract type. Must be monthly or hourly'
    });
  }

  // Contract months validation
  if (contractMonths) {
    if (!Array.isArray(contractMonths) || contractMonths.length === 0) {
      return res.status(400).json({
        message: 'Contract months must be a non-empty array'
      });
    }

    const invalidMonths = contractMonths.filter(month => 
      !Number.isInteger(month) || month < 1 || month > 12
    );
    if (invalidMonths.length > 0) {
      return res.status(400).json({
        message: 'All contract months must be valid integers between 1 and 12'
      });
    }
  }

  // Date validation
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format for end date'
      });
    }
  }

  // Numeric validation
  if (monthlySalary !== undefined && (typeof monthlySalary !== 'number' || monthlySalary < 0)) {
    return res.status(400).json({
      message: 'Monthly salary must be a positive number'
    });
  }

  if (hourlyRate !== undefined && (typeof hourlyRate !== 'number' || hourlyRate < 0)) {
    return res.status(400).json({
      message: 'Hourly rate must be a positive number'
    });
  }

  if (contractualHoursPerMonth !== undefined && (typeof contractualHoursPerMonth !== 'number' || contractualHoursPerMonth < 0)) {
    return res.status(400).json({
      message: 'Contractual hours per month must be a positive number'
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

// Teacher Financial Info Routes
router.post('/', validateTeacherFinancialCreation, createTeacherFinancialInfo);
router.get('/', getAllTeachersFinancial);
router.get('/:teacherId', getTeacherFinancialInfo);
router.put('/:teacherId', validateTeacherFinancialUpdate, updateTeacherFinancialInfo);
router.delete('/:teacherId', deleteTeacherFinancialInfo);

// Payment Dossiers Routes
router.get('/dossiers/all', getAllPaymentDossiers);
router.get('/dossiers/statistics', getPaymentStatistics);
router.get('/dossiers/teacher/:teacherId', getTeacherPaymentDossiers);
router.get('/dossiers/:dossierId', getPaymentDossier);
router.put('/dossiers/:dossierId', updatePaymentDossier);
router.put('/dossiers/bulk/update', validateBulkUpdate, bulkUpdatePaymentDossiers);

module.exports = router;