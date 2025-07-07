// controllers/progressController.js
const StudentProgress = require('../models/StudentProgress');
const User = require('../models/User');
const Exercise = require('../models/Exercise');
const Class = require('../models/Class');

// Get student progress overview
const getStudentProgressOverview = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subject, classId, dateFrom, dateTo } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    // Students can only see their own progress
    if (userRole == 'student' && studentId != userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Teachers can only see progress from their students
    if (userRole == 'teacher') {
      const student = await User.findById(studentId);
      if (!student || !student.studentClass) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const classData = await Class.findById(student.studentClass);
      const teachesStudent = classData.teacherSubjects.some(
        ts => ts.teacher.toString() == userId
      );

      if (!teachesStudent) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    let filter = { student: studentId };
    if (subject) filter.subject = subject;
    if (classId) filter.class = classId;
    if (dateFrom || dateTo) {
      filter.completedAt = {};
      if (dateFrom) filter.completedAt.$gte = new Date(dateFrom);
      if (dateTo) filter.completedAt.$lte = new Date(dateTo);
    }

    const progress = await StudentProgress.find(filter)
      .populate('exercise', 'title type difficulty')
      .populate('subject', 'name')
      .populate('class', 'name')
      .sort({ completedAt: -1 });

    // Calculate statistics
    const stats = {
      totalExercises: progress.length,
      averageAccuracy: 0,
      totalTimeSpent: 0,
      exercisesByType: {
        qcm: 0,
        fill_blanks: 0
      },
      exercisesByDifficulty: {
        easy: 0,
        medium: 0,
        hard: 0
      },
      subjectPerformance: {}
    };

    progress.forEach(p => {
      stats.averageAccuracy += p.accuracyPercentage;
      stats.totalTimeSpent += p.timeSpent;
      stats.exercisesByType[p.exercise.type]++;
      stats.exercisesByDifficulty[p.exercise.difficulty]++;

      const subjectName = p.subject.name;
      if (!stats.subjectPerformance[subjectName]) {
        stats.subjectPerformance[subjectName] = {
          totalExercises: 0,
          totalAccuracy: 0,
          averageAccuracy: 0
        };
      }
      stats.subjectPerformance[subjectName].totalExercises++;
      stats.subjectPerformance[subjectName].totalAccuracy += p.accuracyPercentage;
    });

    // Calculate averages
    if (progress.length > 0) {
      stats.averageAccuracy = Math.round(stats.averageAccuracy / progress.length);
    }

    Object.keys(stats.subjectPerformance).forEach(subject => {
      const subjectData = stats.subjectPerformance[subject];
      subjectData.averageAccuracy = Math.round(
        subjectData.totalAccuracy / subjectData.totalExercises
      );
    });

    res.status(200).json({
      progress,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class progress (Teacher/Admin only)
const getClassProgress = async (req, res) => {
  try {
    const { classId } = req.params;
    const { subject, exerciseId, dateFrom, dateTo } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    // Verify teacher teaches this class
    if (userRole == 'teacher') {
      const classData = await Class.findById(classId);
      const teachesClass = classData.teacherSubjects.some(
        ts => ts.teacher.toString() == userId
      );
      if (!teachesClass) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    let filter = { class: classId };
    if (subject) filter.subject = subject;
    if (exerciseId) filter.exercise = exerciseId;
    if (dateFrom || dateTo) {
      filter.completedAt = {};
      if (dateFrom) filter.completedAt.$gte = new Date(dateFrom);
      if (dateTo) filter.completedAt.$lte = new Date(dateTo);
    }

    const progress = await StudentProgress.find(filter)
      .populate('student', 'name email')
      .populate('exercise', 'title type')
      .populate('subject', 'name')
      .sort({ completedAt: -1 });

    // Group by student
    const studentProgress = {};
    progress.forEach(p => {
      const studentId = p.student._id.toString();
      if (!studentProgress[studentId]) {
        studentProgress[studentId] = {
          student: p.student,
          exercises: [],
          averageAccuracy: 0,
          totalExercises: 0
        };
      }
      studentProgress[studentId].exercises.push(p);
      studentProgress[studentId].totalExercises++;
      studentProgress[studentId].averageAccuracy += p.accuracyPercentage;
    });

    // Calculate averages
    Object.keys(studentProgress).forEach(studentId => {
      const data = studentProgress[studentId];
      data.averageAccuracy = Math.round(data.averageAccuracy / data.totalExercises);
    });

    res.status(200).json({
      classProgress: Object.values(studentProgress),
      totalStudents: Object.keys(studentProgress).length,
      totalExercisesCompleted: progress.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get exercise analytics (Teacher only)
const getExerciseAnalytics = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const teacherId = req.userId;

    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Verify teacher owns this exercise
    if (exercise.createdBy.toString() != teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const submissions = await StudentProgress.find({ exercise: exerciseId })
      .populate('student', 'name')
      .sort({ completedAt: -1 });

    // Analyze questions
    const questionAnalytics = [];
    
    if (exercise.type == 'qcm') {
      exercise.qcmQuestions.forEach((question, index) => {
        const analytics = {
          questionIndex: index,
          questionText: question.questionText,
          totalAnswers: 0,
          correctAnswers: 0,
          accuracy: 0,
          optionDistribution: {}
        };

        // Initialize option distribution
        question.options.forEach(opt => {
          analytics.optionDistribution[opt._id] = {
            text: opt.text,
            count: 0,
            isCorrect: opt.isCorrect
          };
        });

        // Analyze submissions
        submissions.forEach(sub => {
          const answer = sub.qcmAnswers.find(a => a.questionIndex == index);
          if (answer) {
            analytics.totalAnswers++;
            if (answer.isCorrect) analytics.correctAnswers++;
            if (analytics.optionDistribution[answer.selectedOption]) {
              analytics.optionDistribution[answer.selectedOption].count++;
            }
          }
        });

        analytics.accuracy = analytics.totalAnswers > 0
          ? Math.round((analytics.correctAnswers / analytics.totalAnswers) * 100)
          : 0;

        questionAnalytics.push(analytics);
      });
    }

    const overallStats = {
      totalSubmissions: submissions.length,
      uniqueStudents: new Set(submissions.map(s => s.student._id.toString())).size,
      averageScore: submissions.length > 0
        ? submissions.reduce((sum, s) => sum + s.accuracyPercentage, 0) / submissions.length
        : 0,
      averageTimeSpent: submissions.length > 0
        ? submissions.reduce((sum, s) => sum + s.timeSpent, 0) / submissions.length
        : 0
    };

    res.status(200).json({
      exercise: {
        id: exercise._id,
        title: exercise.title,
        type: exercise.type,
        totalPoints: exercise.totalPoints
      },
      analytics: {
        overall: overallStats,
        questions: questionAnalytics,
        submissions: submissions.map(s => ({
          student: s.student,
          accuracy: s.accuracyPercentage,
          timeSpent: s.timeSpent,
          completedAt: s.completedAt,
          attemptNumber: s.attemptNumber
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete student progress (Admin only)
const deleteStudentProgress = async (req, res) => {
  try {
    const { progressId } = req.params;

    const progress = await StudentProgress.findById(progressId);
    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }
    
    await StudentProgress.findByIdAndDelete(progressId);

    res.status(200).json({ message: 'Progress record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getStudentProgressOverview,
  getClassProgress,
  getExerciseAnalytics,
  deleteStudentProgress
};