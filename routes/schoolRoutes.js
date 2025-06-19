const express = require('express');
const router = express.Router();
const {
  createSchool,
  getSchool,
  toggleSchoolAccess
} = require('../controllers/SchoolController');

const { authenticate, isSuperAdmin } = require('../middleware/auth');

// All routes require authentication and superadmin role
router.use(authenticate);
router.use(isSuperAdmin);

router.post('/', createSchool);
router.get('/', getSchool);
router.put('/access', toggleSchoolAccess);

module.exports = router;