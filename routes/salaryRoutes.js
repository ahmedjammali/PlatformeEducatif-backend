// routes/salaryRoutes.js
const express = require("express");
const router = express.Router();
const salaryController = require("../controllers/salaryController");

const { authenticate } = require("../middleware/auth");

router.use(authenticate);

// Get all teachers and admins
router.get("/users", salaryController.getTeachersAndAdmins);

// Create salary configuration
router.post(
  "/configurations",

  salaryController.createSalaryConfiguration
);

// Get salary configurations
router.get(
  "/configurations",

  salaryController.getSalaryConfigurations
);

// Update salary configuration
router.put(
  "/configurations/:configId",

  salaryController.updateSalaryConfiguration
);

// Delete salary configuration
router.delete(
  "/configurations/:configurationId",
  salaryController.deleteSalaryConfiguration
);

// Get salary records
router.get(
  "/records",

  salaryController.getSalaryRecords
);

// Update extra hours for a specific month
router.put(
  "/records/:salaryId/extra-hours",

  salaryController.updateExtraHours
);

// Update payment hours (both regular and extra hours)
router.put("/payment-hours", salaryController.updatePaymentHours);

// Record payment
router.put(
  "/records/:salaryId/payment",

  salaryController.recordPayment
);

// Get salary summary for dashboard
router.get(
  "/summary",

  salaryController.getSalarySummary
);

module.exports = router;
