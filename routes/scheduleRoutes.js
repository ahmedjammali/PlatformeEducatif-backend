// routes/scheduleRoutes.js
const express = require('express');
const router = express.Router();

const {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  createSession,
  getScheduleSessions,
  updateSession,
  deleteSession,
  cloneScheduleToNewYear,
  getScheduleStatistics,
  getClassSchedule,
  getAllClassesSchedules,
  getTeacherSchedule
} = require('../controllers/scheduleController');

const {
  getTeacherTimetable,
  getStudentTimetable,
  getClassTimetable,
  getCurrentWeekType,
  getWeeklySchedule
} = require('../controllers/timetableController');

const {
  authenticate,
  isAdminOrHigher,
  isTeacherOrHigher,
  authorize,
  canAccessClass
} = require('../middleware/auth');

// Validation middleware
const validateScheduleCreation = (req, res, next) => {
  const { name, teacherId, weekType, academicYear } = req.body;
  
  if (!name || !teacherId || !weekType || !academicYear) {
    return res.status(400).json({ 
      message: 'Name, teacher ID, week type, and academic year are required' 
    });
  }

  const validWeekTypes = ['A', 'B', 'both'];
  if (!validWeekTypes.includes(weekType)) {
    return res.status(400).json({   
      message: 'Invalid week type. Must be one of: ' + validWeekTypes.join(', ') 
    });
  }

  // Validate academic year format (should be a 4-digit year)
  if (!/^\d{4}$/.test(academicYear)) {
    return res.status(400).json({ 
      message: 'Academic year must be a 4-digit year (e.g., 2024)' 
    });
  }

  // Validate teacherId format (MongoDB ObjectId)
  if (!/^[0-9a-fA-F]{24}$/.test(teacherId)) {
    return res.status(400).json({ 
      message: 'Invalid teacher ID format' 
    });
  }

  next();
};

const validateSessionCreation = (req, res, next) => {
  const {
    sessionDate,
    startTime,
    endTime,
    className,
    classGrade,
    subjectId
  } = req.body;
  
  if (!sessionDate || !startTime || !endTime || !className || !classGrade || !subjectId) {
    return res.status(400).json({ 
      message: 'Session date, start time, end time, class name, class grade, and subject are required' 
    });
  }

  // Validate date format
  const date = new Date(sessionDate);
  if (isNaN(date.getTime())) {
    return res.status(400).json({ 
      message: 'Invalid session date format' 
    });
  }

  // Check if date is not in the past (except today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return res.status(400).json({ 
      message: 'Session date cannot be in the past' 
    });
  }

  // Validate time format
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res.status(400).json({ 
      message: 'Invalid time format. Use HH:MM format (e.g., 08:30, 14:15)' 
    });
  }

  // Validate session duration (15 minutes minimum, 8 hours maximum)
  const start = startTime.split(':').map(Number);
  const end = endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  const durationMinutes = endMinutes - startMinutes;

  if (durationMinutes < 15) {
    return res.status(400).json({ 
      message: 'Session duration must be at least 15 minutes' 
    });
  }

  if (durationMinutes > 480) { // 8 hours = 480 minutes
    return res.status(400).json({ 
      message: 'Session duration cannot exceed 8 hours' 
    });
  }

  // Validate class name
  if (!className.trim()) {
    return res.status(400).json({ 
      message: 'Class name cannot be empty' 
    });
  }

  // Validate subject ID format
  if (!/^[0-9a-fA-F]{24}$/.test(subjectId)) {
    return res.status(400).json({ 
      message: 'Invalid subject ID format' 
    });
  }

  next();
};

const validateScheduleUpdate = (req, res, next) => {
  const updates = req.body;
  
  // Check if trying to update restricted fields
  const restrictedFields = ['school', 'createdBy', 'teacher'];
  const hasRestrictedField = restrictedFields.some(field => updates.hasOwnProperty(field));
  
  if (hasRestrictedField) {
    return res.status(400).json({ 
      message: 'Cannot update restricted fields: ' + restrictedFields.join(', ') 
    });
  }

  // Validate weekType if provided
  if (updates.weekType) {
    const validWeekTypes = ['A', 'B', 'both'];
    if (!validWeekTypes.includes(updates.weekType)) {
      return res.status(400).json({   
        message: 'Invalid week type. Must be one of: ' + validWeekTypes.join(', ') 
      });
    }
  }

  // Validate academicYear if provided
  if (updates.academicYear && !/^\d{4}$/.test(updates.academicYear)) {
    return res.status(400).json({ 
      message: 'Academic year must be a 4-digit year (e.g., 2024)' 
    });
  }

  // Validate status if provided
  if (updates.status) {
    const validStatuses = ['draft', 'active', 'completed', 'suspended'];
    if (!validStatuses.includes(updates.status)) {
      return res.status(400).json({   
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') 
      });
    }
  }

  next();
};

// Apply authentication to all routes
router.use(authenticate);

// Public utility routes
router.get('/current-week', getCurrentWeekType);
router.get('/weekly', getWeeklySchedule);

// Schedule management routes (Admin/SuperAdmin only)
router.post('/', isAdminOrHigher, validateScheduleCreation, createSchedule);
router.get('/', isTeacherOrHigher, getAllSchedules);
router.get('/:scheduleId', isTeacherOrHigher, getScheduleById);
router.put('/:scheduleId', isAdminOrHigher, validateScheduleUpdate, updateSchedule);
router.delete('/:scheduleId', isAdminOrHigher, deleteSchedule);

// Teacher schedule routes
router.get('/teacher/:teacherId', isTeacherOrHigher, getTeacherSchedule);

// Advanced schedule management
router.post('/:scheduleId/clone', isAdminOrHigher, cloneScheduleToNewYear);
router.get('/:scheduleId/statistics', isTeacherOrHigher, getScheduleStatistics);

// Session management routes (Admin/SuperAdmin only)
router.post('/:scheduleId/sessions', isAdminOrHigher, validateSessionCreation, createSession);
router.get('/:scheduleId/sessions', isTeacherOrHigher, getScheduleSessions);
router.put('/sessions/:sessionId', isAdminOrHigher, updateSession);
router.delete('/sessions/:sessionId', isAdminOrHigher, deleteSession);

// NEW: Class schedule routes for students and parents
router.get('/class/:className/schedule', 
  authorize('student', 'parent', 'teacher', 'admin', 'superadmin'), 
  getClassSchedule
);

router.get('/classes/overview', 
  isAdminOrHigher, 
  getAllClassesSchedules
);

// Timetable routes (legacy support - updated to work with new session structure)
// Teacher timetable - separate routes for with and without teacherId
router.get('/timetable/teacher', 
  authorize('teacher'), 
  getTeacherTimetable
);

router.get('/timetable/teacher/:teacherId', 
  authorize('superadmin', 'admin'), 
  getTeacherTimetable
);

// Student timetable - separate routes for with and without studentId
router.get('/timetable/student', 
  authorize('student'), 
  getStudentTimetable
);

router.get('/timetable/student/:studentId', 
  authorize('superadmin', 'admin', 'teacher'), 
  getStudentTimetable
);

// Class timetable (admins and teachers only)
router.get('/timetable/class/:classId', 
  isTeacherOrHigher,
  canAccessClass,
  getClassTimetable
);

// Additional validation middleware for bulk operations
const validateBulkSessionUpdate = (req, res, next) => {
  const { sessions } = req.body;
  
  if (!sessions || !Array.isArray(sessions)) {
    return res.status(400).json({ 
      message: 'Sessions array is required for bulk update' 
    });
  }

  if (sessions.length === 0) {
    return res.status(400).json({ 
      message: 'At least one session is required' 
    });
  }

  if (sessions.length > 50) {
    return res.status(400).json({ 
      message: 'Cannot update more than 50 sessions at once' 
    });
  }

  // Validate each session update
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    
    if (!session.sessionId) {
      return res.status(400).json({ 
        message: `Session ID is required for session at index ${i}` 
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(session.sessionId)) {
      return res.status(400).json({ 
        message: `Invalid session ID format at index ${i}` 
      });
    }
  }

  next();
};

// Bulk operations routes (Admin/SuperAdmin only)
router.put('/sessions/bulk-update', 
  isAdminOrHigher, 
  validateBulkSessionUpdate, 
  async (req, res) => {
    try {
      const { sessions } = req.body;
      const results = [];
      
      for (const sessionUpdate of sessions) {
        try {
          const updatedSession = await Session.findByIdAndUpdate(
            sessionUpdate.sessionId,
            sessionUpdate.updates,
            { new: true, runValidators: true }
          );
          
          if (updatedSession) {
            results.push({
              sessionId: sessionUpdate.sessionId,
              success: true,
              session: updatedSession
            });
          } else {
            results.push({
              sessionId: sessionUpdate.sessionId,
              success: false,
              error: 'Session not found'
            });
          }
        } catch (error) {
          results.push({
            sessionId: sessionUpdate.sessionId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      res.status(200).json({
        message: `Bulk update completed: ${successCount} successful, ${failureCount} failed`,
        results,
        summary: {
          total: sessions.length,
          successful: successCount,
          failed: failureCount
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error during bulk update', error: error.message });
    }
  }
);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Schedule Management API'
  });
});

module.exports = router;