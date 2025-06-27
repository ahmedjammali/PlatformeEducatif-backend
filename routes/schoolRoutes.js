const express = require('express');
const router = express.Router();
const {
  createSchool,
  getSchool,
  toggleSchoolAccess
} = require('../controllers/SchoolController');

const { authenticate, isSuperAdmin, isAdminOrHigher } = require('../middleware/auth');

// All routes require authentication and superadmin role
router.use(authenticate);

router.post('/',isSuperAdmin ,createSchool);
router.get('/', getSchool);
router.put('/access', isSuperAdmin,toggleSchoolAccess);

module.exports = router;