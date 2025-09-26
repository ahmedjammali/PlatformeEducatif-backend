// Income Analytics Routes for Educational Platform

const express = require('express');
const router = express.Router();
const { getIncomeAnalytics, getIncomeFilters } = require('../controllers/incomeAnalyticsController');
const { exportIncomeExcel, exportIncomePDF } = require('../controllers/exportController');
const { authenticate } = require('../middleware/auth');

// Get comprehensive income analytics
// GET /api/income-analytics
// Query parameters: school, grade, component, category, startDate, endDate, academicYear
router.get('/', authenticate, getIncomeAnalytics);

// Get available filter options for income analytics
// GET /api/income-analytics/filters
router.get('/filters', authenticate, getIncomeFilters);

// Export income analytics to Excel
// GET /api/income-analytics/export/excel
router.get('/export/excel', authenticate, exportIncomeExcel);

// Export income analytics to PDF
// GET /api/income-analytics/export/pdf
router.get('/export/pdf', authenticate, exportIncomePDF);

module.exports = router;