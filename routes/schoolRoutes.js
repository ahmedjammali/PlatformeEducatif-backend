const express = require('express');
const router = express.Router();
const {
  createSchool,
  getSchool,
  toggleSchoolAccess , updateSchoolName
} = require('../controllers/SchoolController');

const { authenticate, isSuperAdmin, isAdminOrHigher } = require('../middleware/auth');

// All routes require authentication and superadmin role
router.get('/', getSchool);
router.use(authenticate);


router.post('/',isSuperAdmin ,createSchool);
router.put('/name',isSuperAdmin ,updateSchoolName);

router.put('/access', isSuperAdmin,toggleSchoolAccess);

module.exports = router;