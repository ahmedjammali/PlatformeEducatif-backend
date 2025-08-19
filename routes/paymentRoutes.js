// routes/paymentRoutes.js - Complete version for existing users management
const express = require('express');
const router = express.Router();

const {
  createOrUpdatePaymentConfig,
  getPaymentConfig,
  getAllStudentsWithPayments,
  generatePaymentForStudent,
  recordMonthlyPayment,
  recordAnnualPayment,
  bulkGeneratePayments,
  getPaymentDashboard,
  updateExistingPaymentRecords,
  getStudentPaymentDetails,
  getPaymentReports,
  deletePaymentRecord,
  getPaymentStatsByMonth,
  exportPaymentData,
  deleteAllPaymentRecords
} = require('../controllers/paymentController');

const {
  authenticate,
  isAdminOrHigher,
  isTeacherOrHigher
} = require('../middleware/auth');

// Validation middleware for payment configuration
const validatePaymentConfig = (req, res, next) => {
  const { paymentAmounts } = req.body;
  
  if (!paymentAmounts) {
    return res.status(400).json({ 
      message: 'Payment amounts are required' 
    });
  }

  const { école, college, lycée } = paymentAmounts;
  
  if (!école || !college || !lycée) {
    return res.status(400).json({ 
      message: 'Payment amounts for all class groups (école, college, lycée) are required' 
    });
  }

  if (école < 0 || college < 0 || lycée < 0) {
    return res.status(400).json({ 
      message: 'Payment amounts must be positive numbers' 
    });
  }

  next();
};

// Validation middleware for monthly payment recording
const validateMonthlyPayment = (req, res, next) => {
  const { monthIndex, amount } = req.body;
  
  if (monthIndex === undefined || monthIndex === null) {
    return res.status(400).json({ 
      message: 'Month index is required' 
    });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ 
      message: 'Valid payment amount is required' 
    });
  }

  if (monthIndex < 0 || monthIndex > 8) {
    return res.status(400).json({ 
      message: 'Month index must be between 0 and 8' 
    });
  }

  const { paymentMethod } = req.body;
  const validMethods = ['cash', 'check', 'bank_transfer', 'online'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return res.status(400).json({ 
      message: 'Invalid payment method. Must be one of: ' + validMethods.join(', ') 
    });
  }

  next();
};

// Validation middleware for annual payment recording
const validateAnnualPayment = (req, res, next) => {
  const { paymentMethod } = req.body;
  
  const validMethods = ['cash', 'check', 'bank_transfer', 'online'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return res.status(400).json({ 
      message: 'Invalid payment method. Must be one of: ' + validMethods.join(', ') 
    });
  }

  const { discount } = req.body;
  if (discount && (discount < 0 || isNaN(discount))) {
    return res.status(400).json({ 
      message: 'Discount must be a positive number' 
    });
  }

  next();
};

// Validation middleware for student ID parameter
const validateStudentId = (req, res, next) => {
  const { studentId } = req.params;
  
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ 
      message: 'Valid student ID is required' 
    });
  }

  next();
};

// Validation middleware for bulk generation
const validateBulkGeneration = (req, res, next) => {
  const { academicYear } = req.body;
  
  if (academicYear && !academicYear.match(/^\d{4}-\d{4}$/)) {
    return res.status(400).json({ 
      message: 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)' 
    });
  }

  next();
};

// Validation middleware for updating existing payment records
const validateUpdateExistingRecords = (req, res, next) => {
  const { academicYear, updateUnpaidOnly } = req.body;
  
  if (academicYear && !academicYear.match(/^\d{4}-\d{4}$/)) {
    return res.status(400).json({ 
      message: 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)' 
    });
  }

  if (updateUnpaidOnly !== undefined && typeof updateUnpaidOnly !== 'boolean') {
    return res.status(400).json({ 
      message: 'updateUnpaidOnly must be a boolean value' 
    });
  }

  next();
};

// Validation middleware for class group filter
const validateClassGroupFilter = (req, res, next) => {
  const { classGroup } = req.query;
  
  if (classGroup) {
    const validClassGroups = ['école', 'college', 'lycée'];
    if (!validClassGroups.includes(classGroup)) {
      return res.status(400).json({ 
        message: 'Invalid class group. Must be one of: ' + validClassGroups.join(', ') 
      });
    }
  }

  next();
};

// Validation middleware for report type
const validateReportType = (req, res, next) => {
  const { reportType } = req.query;
  
  if (reportType) {
    const validReportTypes = ['summary', 'detailed', 'overdue', 'collection'];
    if (!validReportTypes.includes(reportType)) {
      return res.status(400).json({ 
        message: 'Invalid report type. Must be one of: ' + validReportTypes.join(', ') 
      });
    }
  }

  next();
};

// Validation middleware for academic year query parameter
const validateAcademicYearQuery = (req, res, next) => {
  const { academicYear } = req.query;
  
  if (academicYear && !academicYear.match(/^\d{4}-\d{4}$/)) {
    return res.status(400).json({ 
      message: 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)' 
    });
  }

  next();
};

// Apply authentication to all routes
router.use(authenticate);

// ===== PAYMENT CONFIGURATION ROUTES (Admin only) =====
router.post('/config', 
  isAdminOrHigher, 
  validatePaymentConfig, 
  createOrUpdatePaymentConfig
);

router.get('/config', 
  isAdminOrHigher, 
  getPaymentConfig
);

// ===== DASHBOARD ROUTE =====
router.get('/dashboard', 
  isTeacherOrHigher, 
  validateAcademicYearQuery,
  getPaymentDashboard
);

// ===== MAIN ADMIN PAGE ROUTE - List all students with payment status =====
router.get('/students', 
  isTeacherOrHigher, 
  validateClassGroupFilter,
  validateAcademicYearQuery,
  getAllStudentsWithPayments
);

// ===== STUDENT PAYMENT MANAGEMENT ROUTES =====

// Get individual student payment details
router.get('/student/:studentId', 
  isTeacherOrHigher, 
  validateStudentId,
  validateAcademicYearQuery,
  getStudentPaymentDetails
);

// Generate payment record for a specific student
router.post('/student/:studentId/generate', 
  isAdminOrHigher, 
  validateStudentId, 
  generatePaymentForStudent
);

// Record monthly payment for a student
router.post('/student/:studentId/payment/monthly', 
  isAdminOrHigher, 
  validateStudentId, 
  validateMonthlyPayment, 
  recordMonthlyPayment
);

// Record annual payment for a student
router.post('/student/:studentId/payment/annual', 
  isAdminOrHigher, 
  validateStudentId, 
  validateAnnualPayment, 
  recordAnnualPayment
);

// Delete payment record for a student
router.delete('/student/:studentId', 
  isAdminOrHigher, 
  validateStudentId,
  validateAcademicYearQuery,
  deletePaymentRecord
);

// ===== BULK OPERATIONS ROUTES (Admin only) =====
router.post('/bulk/generate', 
  isAdminOrHigher, 
  validateBulkGeneration, 
  bulkGeneratePayments
);

// Update existing payment records when configuration changes
router.put('/bulk/update-existing', 
  isAdminOrHigher, 
  validateUpdateExistingRecords, 
  updateExistingPaymentRecords
);

// ===== REPORTING ROUTES =====

// Get payment reports
router.get('/reports', 
  isTeacherOrHigher, 
  validateReportType,
  validateClassGroupFilter,
  validateAcademicYearQuery,
  getPaymentReports
);

// Get monthly payment statistics
router.get('/stats/monthly', 
  isTeacherOrHigher, 
  validateAcademicYearQuery,
  getPaymentStatsByMonth
);

// Export payment data
router.get('/export', 
  isAdminOrHigher, 
  validateClassGroupFilter,
  validateAcademicYearQuery,
  exportPaymentData
);

router.delete('/bulk/delete-all',   isAdminOrHigher, 
  deleteAllPaymentRecords

  ),

// Error handling middleware for this router
router.use((err, req, res, next) => {
  console.error('Payment route error:', err);
  res.status(500).json({ 
    message: 'Internal server error in payment module',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

module.exports = router;