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
  getClassTeachers , 
  getStudentClass
} = require('../controllers/ClassController');

const {
  authenticate,
  isAdmin,
  isAdminOrHigher,
  isTeacherOrHigher
} = require('../middleware/auth');

router.use(authenticate);

// Admin only routes
router.post('/', isAdminOrHigher, createClass);
router.put('/:classId', isAdminOrHigher, updateClass);
router.delete('/:classId', isAdminOrHigher, deleteClass);
router.post('/:classId/students', isAdminOrHigher, addStudentToClass);
router.delete('/:classId/students/:studentId', isAdminOrHigher, removeStudentFromClass);
router.post('/:classId/teachers', isAdminOrHigher, assignTeacherToSubjects);
router.delete('/:classId/teachers/:teacherId', isAdminOrHigher, removeTeacherFromClass);

// Teacher or higher (and students for their own class)
router.get('/', getAllClasses);
router.get('/:classId', getClassById);
router.get('/:classId/students', isTeacherOrHigher, getClassStudents);
router.get('/:classId/teachers', getClassTeachers);

// Get class for a specific student
router.get('/student/my-class', getStudentClass);

module.exports = router;