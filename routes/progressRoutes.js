const express = require('express');
const router = express.Router();
const {
  getStudentProgressOverview,
  getClassProgress,
  getExerciseAnalytics,
  deleteStudentProgress
} = require('../controllers/progressController');

const {
  authenticate,
  isTeacher,
  isTeacherOrHigher,
  isAdmin
} = require('../middleware/auth');

router.use(authenticate);

// Student progress (teachers see all, students see their own)
router.get('/student/:studentId', getStudentProgressOverview);

// Teacher only routes
router.get('/class/:classId', isTeacherOrHigher, getClassProgress);
router.get('/exercise/:exerciseId/analytics', isTeacher, getExerciseAnalytics);

// Admin only
router.delete('/:progressId', isAdmin, deleteStudentProgress);

module.exports = router;