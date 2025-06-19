const express = require('express');
const router = express.Router();
const {
  createClass,
  getAllClasses,
  getClassById,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  assignTeacherToSubjects,
  removeTeacherFromClass,
  getClassStudents,
  getClassTeachers
} = require('../controllers/ClassController');

const {
  authenticate,
  isAdmin,
  isTeacherOrHigher
} = require('../middleware/auth');

router.use(authenticate);

// Admin only routes
router.post('/', isAdmin, createClass);
router.put('/:classId', isAdmin, updateClass);
router.delete('/:classId', isAdmin, deleteClass);
router.post('/:classId/students', isAdmin, addStudentToClass);
router.delete('/:classId/students/:studentId', isAdmin, removeStudentFromClass);
router.post('/:classId/teachers', isAdmin, assignTeacherToSubjects);
router.delete('/:classId/teachers/:teacherId', isAdmin, removeTeacherFromClass);

// Teacher or higher (and students for their own class)
router.get('/', getAllClasses);
router.get('/:classId', getClassById);
router.get('/:classId/students', isTeacherOrHigher, getClassStudents);
router.get('/:classId/teachers', getClassTeachers);

module.exports = router;