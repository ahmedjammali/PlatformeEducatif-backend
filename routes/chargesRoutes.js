const express = require('express');
const router = express.Router();
const chargeController = require('../controllers/chargeController');
const { authenticate } = require('../middleware/auth');

// Middleware to ensure user is authenticated for all charge routes
router.use(authenticate);

// ================== CHARGE ROUTES ==================

// Create a new charge
router.post('/', chargeController.createCharge);

// Get all charges with filtering and pagination
router.get('/', chargeController.getAllCharges);

// Get charges summary/statistics
router.get('/summary', chargeController.getChargesSummary);

// Bulk delete charges
router.delete('/bulk', chargeController.bulkDeleteCharges);

// ================== PARAMETERIZED CHARGE ROUTES ==================
// Note: These MUST come after all specific routes to avoid conflicts

// Get specific charge by ID
router.get('/:chargeId', chargeController.getChargeById);

// Update specific charge
router.put('/:chargeId', chargeController.updateCharge);

// Delete specific charge
router.delete('/:chargeId', chargeController.deleteCharge);

module.exports = router;