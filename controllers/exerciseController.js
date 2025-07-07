// controllers/exerciseController.js
const Exercise = require('../models/Exercise');
const Class = require('../models/Class');
const School = require('../models/School');
const StudentProgress = require('../models/StudentProgress');
const User = require('../models/User');


// Create exercise (Teacher only)
const createExercise = async (req, res) => {
  try {
    const {
      title,
      type,
      subject,
      classId,
      difficulty,
      qcmQuestions,
      fillBlankQuestions,
      metadata,
      dueDate
    } = req.body;
    
    const teacherId = req.userId;

    // Get school
    const school = await School.findOne();
    if (!school) {
      return res.status(400).json({ message: 'No school found' });
    }

    // Verify teacher teaches this subject in this class
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const teacherEntry = classData.teacherSubjects.find(
      ts => {
        const teacherIdToCompare = ts.teacher._id ? ts.teacher._id.toString() : ts.teacher.toString();
      
      
        
        return teacherIdToCompare == teacherId && 
               ts.subjects.some(s => {
                  console.log(s);
                  console.log(`Comparing subject ID: ${s._id ? s._id.toString() : s.toString()} with ${subject}`);
                 const subjectIdToCompare = s._id ? s._id.toString() : s.toString();
                 return subjectIdToCompare === subject;
               });
      }
    );

    if (!teacherEntry) {
      return res.status(403).json({ 
        message: 'You do not teach this subject in this class' 
      });
    }

    // Create exercise based on type
    const exerciseData = {
      title,
      type,
      subject,
      class: classId,
      createdBy: teacherId,
      school: school._id,
      difficulty,
      metadata,
      dueDate
    };

    if (type === 'qcm') {
      exerciseData.qcmQuestions = qcmQuestions;
    } else if (type === 'fill_blanks') {
      exerciseData.fillBlankQuestions = fillBlankQuestions;
    }

    const exercise = new Exercise(exerciseData);
    const savedExercise = await exercise.save();

    res.status(201).json({
      message: 'Exercise created successfully',
      exercise: savedExercise
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all exercises (filtered by user role)
const getAllExercises = async (req, res) => {
  try {
    const { classId, subject, type, page = 1, limit = 50 } = req.query;
    const userId = req.userId;
    const userRole = req.userRole;

    let filter = { isActive: true };

    // Get school
    const school = await School.findOne();
    if (!school) {
      return res.status(400).json({ message: 'No school found' });
    }
    
    filter.school = school._id;

    if (classId) filter.class = classId;
    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    // Teachers see only their exercises
    if (userRole === 'teacher') {
      filter.createdBy = userId;
    }

    // Students see only exercises from their class
    if (userRole === 'student') {
      const user = await require('../models/User').findById(userId);
      if (!user.studentClass) {
        return res.status(200).json({ exercises: [], pagination: {} });
      }
      filter.class = user.studentClass;
    }

    const skip = (page - 1) * limit;

    const exercises = await Exercise.find(filter)
      .populate('subject', 'name')
      .populate('class', 'name grade')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Exercise.countDocuments(filter);

    res.status(200).json({
      exercises,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalExercises: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get exercise by ID
const getExerciseById = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const userId = req.userId;
    const userRole = req.userRole;

    const exercise = await Exercise.findById(exerciseId)
      .populate('subject', 'name')
      .populate('class', 'name grade')
      .populate('createdBy', 'name');

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Check access permissions
    if (userRole === 'teacher' && exercise.createdBy._id.toString() != userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (userRole === 'student') {
      const user = await require('../models/User').findById(userId);
      if (!user.studentClass || user.studentClass.toString() !== exercise.class._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get student's progress on this exercise
      const progress = await StudentProgress.findOne({
        student: userId,
        exercise: exerciseId
      }).sort({ attemptNumber: -1 });

      return res.status(200).json({
        exercise,
        studentProgress: progress
      });
    }

    res.status(200).json({ exercise });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update exercise (Teacher only)
const updateExercise = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const updates = req.body;
    const teacherId = req.userId;

    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Check if teacher owns this exercise
    if (exercise.createdBy.toString() != teacherId) {
      return res.status(403).json({ message: 'You can only update your own exercises' });
    }

    // Don't allow changing certain fields
    delete updates.createdBy;
    delete updates.school;
    delete updates.class;
    delete updates.subject;

    const updatedExercise = await Exercise.findByIdAndUpdate(
      exerciseId,
      updates,
      { new: true, runValidators: true }
    )
    .populate('subject', 'name')
    .populate('class', 'name grade');

    res.status(200).json({
      message: 'Exercise updated successfully',
      exercise: updatedExercise
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Delete exercise (Teacher only) - Hard delete with cascade
const deleteExercise = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const teacherId = req.userId;

    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Check if teacher owns this exercise
    if (exercise.createdBy.toString() != teacherId) {
      return res.status(403).json({ message: 'You can only delete your own exercises' });
    }

    // Delete all student progress records related to this exercise
    const deletedProgressCount = await StudentProgress.deleteMany({ exercise: exerciseId });

    // Hard delete - completely remove exercise from database
    await Exercise.findByIdAndDelete(exerciseId);

    res.status(200).json({ 
      message: 'Exercise and all related progress deleted successfully',
      deletedProgressRecords: deletedProgressCount.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Submit exercise (Student only)
const submitExercise = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { answers } = req.body;
    const studentId = req.userId;

    const exercise = await Exercise.findById(exerciseId)
      .populate('class')
      .populate('subject');

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Verify student belongs to the class
    const student = await require('../models/User').findById(studentId);
    if (!student.studentClass || student.studentClass.toString() !== exercise.class._id.toString()) {
      return res.status(403).json({ message: 'You do not belong to this class' });
    }

    // Check previous attempts
    const previousAttempts = await StudentProgress.countDocuments({
      student: studentId,
      exercise: exerciseId
    });

    if (previousAttempts >= (exercise.metadata?.maxAttempts || 3)) {
      return res.status(400).json({ 
        message: 'Maximum attempts reached for this exercise' 
      });
    }

    // Calculate score based on exercise type
    let totalPointsEarned = 0;
    let processedAnswers = {};

    if (exercise.type === 'qcm') {
      processedAnswers.qcmAnswers = answers.map((answer, index) => {
        const question = exercise.qcmQuestions[index];
        const isCorrect = question.options.find(
          opt => opt._id.toString() === answer
        )?.isCorrect || false;
        
        const pointsEarned = isCorrect ? question.points : 0;
        totalPointsEarned += pointsEarned;

        return {
          questionIndex: index,
          selectedOption: answer,
          isCorrect,
          pointsEarned
        };
      });
    } else if (exercise.type === 'fill_blanks') {
      processedAnswers.fillBlankAnswers = answers.map((answer, qIndex) => {
        const question = exercise.fillBlankQuestions[qIndex];
        let questionPoints = 0;
        
        const blankAnswers = answer.blanks.map((blank, bIndex) => {
          const correctAnswer = question.blanks[bIndex].correctAnswer.toLowerCase();
          const studentAnswer = blank.toLowerCase().trim();
          const isCorrect = studentAnswer === correctAnswer;
          
          if (isCorrect) {
            questionPoints += question.points / question.blanks.length;
          }

          return {
            blankIndex: bIndex,
            studentAnswer: blank,
            isCorrect
          };
        });

        totalPointsEarned += questionPoints;

        return {
          questionIndex: qIndex,
          blankAnswers,
          pointsEarned: questionPoints
        };
      });
    }

    // Create progress record
    const progress = new StudentProgress({
      student: studentId,
      exercise: exerciseId,
      subject: exercise.subject._id,
      class: exercise.class._id,
      ...processedAnswers,
      totalPointsEarned,
      maxPossiblePoints: exercise.totalPoints,
      attemptNumber: previousAttempts + 1,
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // Assume 30 minutes ago
      completedAt: new Date()
    });

    await progress.save();

    res.status(201).json({
      message: 'Exercise submitted successfully',
      progress: {
        totalPointsEarned,
        maxPossiblePoints: exercise.totalPoints,
        accuracyPercentage: progress.accuracyPercentage,
        attemptNumber: progress.attemptNumber
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get student progress for an exercise
const getStudentProgress = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { studentId } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    let targetStudentId = studentId;

    // Students can only see their own progress
    if (userRole == 'student') {
      targetStudentId = userId;
    }

    if (!targetStudentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const progress = await StudentProgress.find({
      student: targetStudentId,
      exercise: exerciseId
    })
    .populate('student', 'name email')
    .sort({ attemptNumber: 1 });

    res.status(200).json({
      progress,
      totalAttempts: progress.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// Get exercises by subject for student
const getExercisesBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const studentId = req.userId;
    const { page = 1, limit = 20, difficulty, status } = req.query;

    console.log(`Fetching exercises for subject ${subjectId} for student ${studentId}`);

    // Get student's class
    const student = await User.findById(studentId);
    if (!student || !student.studentClass) {
      return res.status(403).json({ 
        message: 'You must be assigned to a class to view exercises' 
      });
    }

    // Base filter
    let filter = {
      subject: subjectId,
      class: student.studentClass,
      isActive: true
    };

    if (difficulty) filter.difficulty = difficulty;

    const skip = (page - 1) * limit;

    // Get exercises
    const exercises = await Exercise.find(filter)
      .select('title type difficulty totalPoints dueDate createdAt metadata')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get student's progress for these exercises
    const exerciseIds = exercises.map(e => e._id);
    const progressRecords = await StudentProgress.find({
      student: studentId,
      exercise: { $in: exerciseIds }
    }).sort({ attemptNumber: -1 });

    // Create a map of exercise progress
    const progressMap = {};
    progressRecords.forEach(progress => {
      const exerciseId = progress.exercise.toString();
      if (!progressMap[exerciseId] || progress.attemptNumber > progressMap[exerciseId].attemptNumber) {
        progressMap[exerciseId] = {
          attemptNumber: progress.attemptNumber,
          score: progress.totalPointsEarned,
          accuracy: progress.accuracyPercentage,
          completedAt: progress.completedAt,
          status: progress.accuracyPercentage >= 50 ? 'passed' : 'failed'
        };
      }
    });

    // Combine exercises with progress
    const exercisesWithProgress = exercises.map(exercise => {
      const progress = progressMap[exercise._id.toString()];
      return {
        ...exercise.toObject(),
        studentProgress: progress || null,
        status: progress ? 'completed' : 'pending',
        remainingAttempts: progress 
          ? Math.max(0, (exercise.metadata?.maxAttempts || 3) - progress.attemptNumber)
          : (exercise.metadata?.maxAttempts || 3)
      };
    });

    const total = await Exercise.countDocuments(filter);

    res.status(200).json({
      exercises: exercisesWithProgress,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalExercises: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createExercise,
  getAllExercises,
  getExerciseById,
  updateExercise,
  deleteExercise,
  submitExercise,
  getStudentProgress , 
  getExercisesBySubject
};