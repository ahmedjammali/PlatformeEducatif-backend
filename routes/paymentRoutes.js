  // Updated Payment Routes with Grade-specific pricing, Uniform, and Transportation

  const express = require('express');
  const router = express.Router();

  const {
    createOrUpdatePaymentConfig,
    getPaymentConfig,
    getAllStudentsWithPayments,
    generatePaymentForStudent,
    recordUniformPayment,                    // ✅ NEW
    recordMonthlyTuitionPayment,             // ✅ UPDATED
    recordMonthlyTransportationPayment,      // ✅ NEW
    recordAnnualTuitionPayment,              // ✅ UPDATED
    bulkGeneratePayments,
    getPaymentDashboard,
    updateExistingPaymentRecords,
    getStudentPaymentDetails,
    getPaymentReports,
    deletePaymentRecord,
    getPaymentStatsByMonth,
    exportPaymentData,
    deleteAllPaymentRecords , 
    updatePaymentRecordComponents,
    applyStudentDiscount,
    removeStudentDiscount
  } = require('../controllers/paymentController');

  const {
    authenticate,
    isAdminOrHigher,
    isTeacherOrHigher
  } = require('../middleware/auth');

  const validateUpdatePaymentComponents = (req, res, next) => {
  const { hasUniform, transportationType } = req.body;
  
  if (hasUniform !== undefined && typeof hasUniform !== 'boolean') {
    return res.status(400).json({ 
      message: 'hasUniform must be a boolean value' 
    });
  }
  
  if (transportationType && !['close', 'far'].includes(transportationType)) {
    return res.status(400).json({ 
      message: 'transportationType must be either "close", "far", or null' 
    });
  }

  next();
};

  // ✅ UPDATED: Validation middleware for payment configuration
  const validatePaymentConfig = (req, res, next) => {
    const { gradeAmounts, uniform, transportation } = req.body;
    
    if (!gradeAmounts) {
      return res.status(400).json({ 
        message: 'Grade amounts are required' 
      });
    }

    // ✅ UPDATED: Validate all required grades with new Maternal structure
    const requiredGrades = [
      // Maternal
      'Maternal', // ✅ UPDATED
      // Primaire
      '1ère année primaire', '2ème année primaire', '3ème année primaire', 
      '4ème année primaire', '5ème année primaire', '6ème année primaire',
      // Collège + Lycée
      '7ème année', '8ème année', '9ème année', 
      '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'
    ];
    
    for (const grade of requiredGrades) {
      if (!gradeAmounts[grade] && gradeAmounts[grade] !== 0) {
        return res.status(400).json({ 
          message: `Payment amount for ${grade} is required` 
        });
      }
      
      if (gradeAmounts[grade] < 0) {
        return res.status(400).json({ 
          message: `Payment amount for ${grade} must be positive` 
        });
      }
    }

    // ✅ NEW: Validate uniform configuration
    if (uniform && uniform.enabled) {
      if (!uniform.price && uniform.price !== 0) {
        return res.status(400).json({ 
          message: 'Uniform price is required when uniform is enabled' 
        });
      }
      
      if (uniform.price < 0) {
        return res.status(400).json({ 
          message: 'Uniform price must be positive' 
        });
      }
    }

    // ✅ NEW: Validate transportation configuration
    if (transportation && transportation.enabled) {
      if (transportation.tariffs.close.enabled) {
        if (!transportation.tariffs.close.monthlyPrice && transportation.tariffs.close.monthlyPrice !== 0) {
          return res.status(400).json({ 
            message: 'Close zone transportation price is required when enabled' 
          });
        }
        
        if (transportation.tariffs.close.monthlyPrice < 0) {
          return res.status(400).json({ 
            message: 'Close zone transportation price must be positive' 
          });
        }
      }
      
      if (transportation.tariffs.far.enabled) {
        if (!transportation.tariffs.far.monthlyPrice && transportation.tariffs.far.monthlyPrice !== 0) {
          return res.status(400).json({ 
            message: 'Far zone transportation price is required when enabled' 
          });
        }
        
        if (transportation.tariffs.far.monthlyPrice < 0) {
          return res.status(400).json({ 
            message: 'Far zone transportation price must be positive' 
          });
        }
      }
    }

    next();
  };

  // ✅ NEW: Validation middleware for student payment generation
  const validateStudentPaymentGeneration = (req, res, next) => {
    const { hasUniform, transportationType } = req.body;
    
    if (hasUniform !== undefined && typeof hasUniform !== 'boolean') {
      return res.status(400).json({ 
        message: 'hasUniform must be a boolean value' 
      });
    }
    
    if (transportationType && !['close', 'far'].includes(transportationType)) {
      return res.status(400).json({ 
        message: 'transportationType must be either "close" or "far"' 
      });
    }

    next();
  };

  // ✅ UPDATED: Validation middleware for monthly payment recording
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

    if (monthIndex < 0 || monthIndex > 11) { // ✅ UPDATED: 0-11 for array index
      return res.status(400).json({ 
        message: 'Month index must be between 0 and 11' 
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

  // ✅ NEW: Validation middleware for uniform payment
  const validateUniformPayment = (req, res, next) => {
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

  // ✅ UPDATED: Validation middleware for grade filters
  const validateGradeFilters = (req, res, next) => {
    const { gradeCategory, grade } = req.query;
    
    if (gradeCategory) {
      const validGradeCategories = ['maternelle', 'primaire', 'secondaire'];
      if (!validGradeCategories.includes(gradeCategory)) {
        return res.status(400).json({ 
          message: 'Invalid grade category. Must be one of: ' + validGradeCategories.join(', ') 
        });
      }
    }
    
    if (grade) {
      const validGrades = [
        // Maternal
        'Maternal', // ✅ UPDATED
        // Primaire
        '1ère année primaire', '2ème année primaire', '3ème année primaire', 
        '4ème année primaire', '5ème année primaire', '6ème année primaire',
        // Secondaire
        '1ère année secondaire', '2ème année secondaire', '3ème année secondaire', 
        '4ème année secondaire', '5ème année secondaire', '6ème année secondaire', '7ème année secondaire'
      ];
      
      if (!validGrades.includes(grade)) {
        return res.status(400).json({ 
          message: 'Invalid grade. Must be one of the supported grades.' 
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

  const validateDiscount = (req, res, next) => {
  const { discountType, percentage } = req.body;
  
  if (!discountType || !['monthly', 'annual'].includes(discountType)) {
    return res.status(400).json({ 
      message: 'discountType must be either "monthly" or "annual"' 
    });
  }
  
  if (percentage === undefined || percentage < 0 || percentage > 100) {
    return res.status(400).json({ 
      message: 'percentage must be between 0 and 100' 
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
    validateAcademicYearQuery,
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
    validateGradeFilters,                    // ✅ UPDATED
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

  // ✅ UPDATED: Generate payment record for a specific student
  router.post('/student/:studentId/generate', 
    isAdminOrHigher, 
    validateStudentId,
    validateStudentPaymentGeneration,        // ✅ NEW
    generatePaymentForStudent
  );

    router.put('/student/:studentId/components', 
  isAdminOrHigher, 
  validateStudentId,
  validateUpdatePaymentComponents,
  updatePaymentRecordComponents
);
  // ✅ NEW: Record uniform payment for a student
  router.post('/student/:studentId/payment/uniform', 
    isAdminOrHigher, 
    validateStudentId,
    validateUniformPayment,
    recordUniformPayment
  );

  // ✅ UPDATED: Record monthly tuition payment for a student
  router.post('/student/:studentId/payment/tuition/monthly', 
    isAdminOrHigher, 
    validateStudentId, 
    validateMonthlyPayment, 
    recordMonthlyTuitionPayment
  );

  // ✅ NEW: Record monthly transportation payment for a student
  router.post('/student/:studentId/payment/transportation/monthly', 
    isAdminOrHigher, 
    validateStudentId, 
    validateMonthlyPayment, 
    recordMonthlyTransportationPayment
  );

  // ✅ UPDATED: Record annual tuition payment for a student
  router.post('/student/:studentId/payment/tuition/annual', 
    isAdminOrHigher, 
    validateStudentId, 
    validateAnnualPayment, 
    recordAnnualTuitionPayment
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
    updateExistingPaymentRecords
  );

  // Delete all payment records for academic year
  router.delete('/bulk/delete-all', 
    isAdminOrHigher, 
    deleteAllPaymentRecords
  );

  // ===== REPORTING ROUTES =====

  // Get payment reports
  router.get('/reports', 
    isTeacherOrHigher, 
    validateReportType,
    validateGradeFilters,                    // ✅ UPDATED
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
    validateGradeFilters,                    // ✅ UPDATED
    validateAcademicYearQuery,
    exportPaymentData
  );

  router.post('/student/:studentId/discount', 
  isAdminOrHigher, 
  validateStudentId,
  validateDiscount,
  applyStudentDiscount
);

// Remove discount from student
router.delete('/student/:studentId/discount', 
  isAdminOrHigher, 
  validateStudentId,
  validateAcademicYearQuery,
  removeStudentDiscount
);

  // ✅ NEW: Get available grades endpoint
  router.get('/grades', 
    isTeacherOrHigher,
    (req, res) => {
      const PaymentConfiguration = require('../models/PaymentConfiguration');
      const grades = PaymentConfiguration.getAvailableGrades();
      const categorizedGrades = {
        maternelle: ['Maternal'], // ✅ UPDATED
        primaire: ['1ère année primaire', '2ème année primaire', '3ème année primaire', '4ème année primaire', '5ème année primaire', '6ème année primaire'],
        secondaire: ['7ème année', '8ème année', '9ème année', '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée']
      };
      
      res.status(200).json({
        allGrades: grades,
        categorizedGrades: categorizedGrades
      });
    }
  );

  // Error handling middleware for this router
  router.use((err, req, res, next) => {
    console.error('Payment route error:', err);
    res.status(500).json({ 
      message: 'Internal server error in payment module',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  });

  module.exports = router;