// routes/exportRoutes.js
const express = require('express');
const router = express.Router();
const { exportCombinedExcel, exportCombinedPDF } = require('../controllers/exportController');
const { authenticate } = require('../middleware/auth');

// Export combined income and outcome analytics to Excel
// GET /api/exports/combined/excel
// Query parameters: schoolId, grade, component, category, startDate, endDate, academicYear, userRole, chargeCategory
router.get('/combined/excel', authenticate, exportCombinedExcel);

// Export combined income and outcome analytics to PDF
// GET /api/exports/combined/pdf
// Query parameters: schoolId, grade, component, category, startDate, endDate, academicYear, userRole, chargeCategory
router.get('/combined/pdf', authenticate, exportCombinedPDF);

module.exports = router;