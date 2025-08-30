const express = require('express');
const router = express.Router();
const {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject
} = require('../controllers/subjectController');

const {
  authenticate,
  isAdminOrHigher,
  isTeacherOrHigher,
  
} = require('../middleware/auth');

router.use(authenticate);

// Admin only routes
router.post('/', isAdminOrHigher, createSubject);
router.put('/:subjectId', isAdminOrHigher, updateSubject);
router.delete('/:subjectId', isAdminOrHigher, deleteSubject);

// Teacher or higher can view
router.get('/', isTeacherOrHigher, getAllSubjects);
router.get('/:subjectId', isTeacherOrHigher, getSubjectById);

module.exports = router;