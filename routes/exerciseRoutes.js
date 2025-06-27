const express = require('express');
const router = express.Router();
const {
  createExercise,
  getAllExercises,
  getExerciseById,
  updateExercise,
  deleteExercise,
  submitExercise,
  getStudentProgress , 
  getExercisesBySubject
} = require('../controllers/exerciseController');

const {
  authenticate,
  isTeacher,
  isStudent
} = require('../middleware/auth');

router.use(authenticate);

// Teacher routes
router.post('/', isTeacher, createExercise);
router.put('/:exerciseId', isTeacher, updateExercise);
router.delete('/:exerciseId', isTeacher, deleteExercise);

// Both teachers and students
router.get('/', getAllExercises);
router.get('/:exerciseId', getExerciseById);

// Student routes
router.post('/:exerciseId/submit', isStudent, submitExercise);

// Progress route (teachers see all, students see their own)
router.get('/:exerciseId/progress', getStudentProgress);

// Get exercises by subject
router.get('/subject/:subjectId', getExercisesBySubject);

module.exports = router;