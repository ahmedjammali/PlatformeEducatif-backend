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
  isAdmin,
  isTeacherOrHigher
} = require('../middleware/auth');

router.use(authenticate);

// Admin only routes
router.post('/', isAdmin, createSubject);
router.put('/:subjectId', isAdmin, updateSubject);
router.delete('/:subjectId', isAdmin, deleteSubject);

// Teacher or higher can view
router.get('/', isTeacherOrHigher, getAllSubjects);
router.get('/:subjectId', isTeacherOrHigher, getSubjectById);

module.exports = router;