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
  getTeacherSchedule,
  generateSchedulePDF
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
  const { name, teacherId, weekType } = req.body;

  if (!name || !teacherId || !weekType) {
    return res.status(400).json({
      message: 'Le nom, l\'identifiant de l\'enseignant et le type de semaine sont requis'
    });
  }

  const validWeekTypes = ['A', 'B', 'both'];
  if (!validWeekTypes.includes(weekType)) {
    return res.status(400).json({
      message: 'Type de semaine invalide. Doit être l\'un de : ' + validWeekTypes.join(', ')
    });
  }


  // Validate teacherId format (MongoDB ObjectId)
  if (!/^[0-9a-fA-F]{24}$/.test(teacherId)) {
    return res.status(400).json({
      message: 'Format d\'identifiant d\'enseignant invalide'
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
      message: 'La date de session, l\'heure de début, l\'heure de fin, le nom de la classe, le niveau de la classe et la matière sont requis'
    });
  }

  // Validate date format
  const date = new Date(sessionDate);
  if (isNaN(date.getTime())) {
    return res.status(400).json({
      message: 'Format de date de session invalide'
    });
  }

  // Check if date is not in the past (except today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return res.status(400).json({
      message: 'La date de session ne peut pas être dans le passé'
    });
  }

  // Validate time format
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res.status(400).json({
      message: 'Format d\'heure invalide. Utilisez le format HH:MM (ex: 08:30, 14:15)'
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
      message: 'La durée de la session doit être d\'au moins 15 minutes'
    });
  }

  if (durationMinutes > 480) { // 8 hours = 480 minutes
    return res.status(400).json({
      message: 'La durée de la session ne peut pas dépasser 8 heures'
    });
  }

  // Validate class name
  if (!className.trim()) {
    return res.status(400).json({
      message: 'Le nom de la classe ne peut pas être vide'
    });
  }

  // Validate subject ID format
  if (!/^[0-9a-fA-F]{24}$/.test(subjectId)) {
    return res.status(400).json({
      message: 'Format d\'identifiant de matière invalide'
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
      message: 'Impossible de mettre à jour les champs restreints : ' + restrictedFields.join(', ')
    });
  }

  // Validate weekType if provided
  if (updates.weekType) {
    const validWeekTypes = ['A', 'B', 'both'];
    if (!validWeekTypes.includes(updates.weekType)) {
      return res.status(400).json({
        message: 'Type de semaine invalide. Doit être l\'un de : ' + validWeekTypes.join(', ')
      });
    }
  }

  // Validate status if provided
  if (updates.status) {
    const validStatuses = ['draft', 'active', 'completed', 'suspended'];
    if (!validStatuses.includes(updates.status)) {
      return res.status(400).json({
        message: 'Statut invalide. Doit être l\'un de : ' + validStatuses.join(', ')
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

// PDF generation route - Allow all authenticated users (students, teachers, admins)
router.post('/generate-pdf', authenticate, generateSchedulePDF);

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
      message: 'Le tableau de sessions est requis pour la mise à jour en masse'
    });
  }

  if (sessions.length === 0) {
    return res.status(400).json({
      message: 'Au moins une session est requise'
    });
  }

  if (sessions.length > 50) {
    return res.status(400).json({
      message: 'Impossible de mettre à jour plus de 50 sessions à la fois'
    });
  }

  // Validate each session update
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    
    if (!session.sessionId) {
      return res.status(400).json({
        message: `L'identifiant de session est requis pour la session à l'index ${i}`
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(session.sessionId)) {
      return res.status(400).json({
        message: `Format d'identifiant de session invalide à l'index ${i}`
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
              error: 'Session introuvable'
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
        message: `Mise à jour en masse terminée : ${successCount} réussies, ${failureCount} échouées`,
        results,
        summary: {
          total: sessions.length,
          successful: successCount,
          failed: failureCount
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Erreur serveur lors de la mise à jour en masse', error: error.message });
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