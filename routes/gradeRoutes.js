const express = require('express');
const router = express.Router();
const {
  createGrade,
  getGradesByStudent,
  getGradesByClass,
  updateGrade,
  deleteGrade,
  getStudentReport
} = require('../controllers/gradeController');

const {
  authenticate,
  isTeacher,
  isTeacherOrHigher
} = require('../middleware/auth');

router.use(authenticate);

// Teacher only routes
router.post('/', isTeacher, createGrade);
router.put('/:gradeId', isTeacher, updateGrade);
router.delete('/:gradeId', isTeacher, deleteGrade);

// Teachers and students can view (with access control in controller)
router.get('/student/:studentId', getGradesByStudent);
router.get('/student/:studentId/report', getStudentReport);

// Teacher or higher
router.get('/class/:classId', isTeacherOrHigher, getGradesByClass);

module.exports = router;