// routes/outcomeAnalyticsRoutes.js
const express = require('express');
const router = express.Router();
const outcomeAnalyticsController = require('../controllers/outcomeAnalyticsController');
const { exportOutcomeExcel, exportOutcomePDF } = require('../controllers/exportController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, outcomeAnalyticsController.getOutcomeAnalytics);

router.get('/filters', authenticate, outcomeAnalyticsController.getOutcomeFilterOptions);

// Export outcome analytics to Excel
// GET /api/outcome-analytics/export/excel
router.get('/export/excel', authenticate, exportOutcomeExcel);

// Export outcome analytics to PDF
// GET /api/outcome-analytics/export/pdf
router.get('/export/pdf', authenticate, exportOutcomePDF);

module.exports = router;