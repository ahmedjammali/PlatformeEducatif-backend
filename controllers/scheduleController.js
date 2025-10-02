// controllers/scheduleController.js
const Schedule = require('../models/Schedule');
const Session = require('../models/Session');
const User = require('../models/User');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Create a new schedule for a specific teacher (Admin/SuperAdmin only)
const createSchedule = async (req, res) => {
  try {
    const { name, teacherId, weekType, description } = req.body;
    const creatorId = req.userId;
    const schoolId = req.schoolId;

    // Validate input
    if (!name || !teacherId || !weekType) {
      return res.status(400).json({
        message: 'Le nom, l\'identifiant de l\'enseignant et le type de semaine sont requis'
      });
    }

    // Verify teacher exists and belongs to the school
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      school: schoolId
    });

    if (!teacher) {
      return res.status(404).json({
        message: 'Enseignant introuvable ou n\'appartient pas à votre établissement'
      });
    }

    // Check if schedule already exists for this teacher
    const existingSchedule = await Schedule.findOne({
      teacher: teacherId,
      school: schoolId,
      isActive: true
    });

    if (existingSchedule) {
      return res.status(400).json({
        message: 'Un emploi du temps actif existe déjà pour cet enseignant'
      });
    }

    const schedule = new Schedule({
      name,
      teacher: teacherId,
      weekType,
      description,
      school: schoolId,
      createdBy: creatorId
    });

    const savedSchedule = await schedule.save();
    await savedSchedule.populate('teacher', 'name email');

    res.status(201).json({
      message: 'Emploi du temps créé avec succès',
      schedule: savedSchedule
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get all schedules with teacher information
const getAllSchedules = async (req, res) => {
  try {
    const { page = 1, limit = 50, weekType, teacherId, status } = req.query;
    const schoolId = req.schoolId;

    let filter = { school: schoolId };

    if (weekType) filter.weekType = weekType;
    if (teacherId) filter.teacher = teacherId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const schedules = await Schedule.find(filter)
      .populate('teacher', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Schedule.countDocuments(filter);

    // Get session count and statistics for each schedule
    const schedulesWithStats = await Promise.all(
      schedules.map(async (schedule) => {
        const stats = await schedule.getStatistics();
        return {
          ...schedule.toObject(),
          statistics: stats
        };
      })
    );

    res.status(200).json({
      schedules: schedulesWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalSchedules: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get schedule by ID with all sessions
const getScheduleById = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { groupBy = 'date', startDate, endDate } = req.query;

    const schedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name email')
      .populate('createdBy', 'name email');

    if (!schedule) {
      return res.status(404).json({ message: 'Emploi du temps introuvable' });
    }

    // Build session filter
    let sessionFilter = { 
      schedule: scheduleId, 
      isActive: true 
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all sessions for this schedule
    const sessions = await Session.find(sessionFilter)
      .populate('subject', 'name')
      .sort({ sessionDate: 1, startTime: 1 });

    let groupedSessions = {};

    if (groupBy === 'date') {
      // Group by session date
      groupedSessions = sessions.reduce((acc, session) => {
        const dateKey = session.sessionDate.toISOString().split('T')[0];
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(session);
        return acc;
      }, {});
    } else if (groupBy === 'class') {
      // Group by class name
      groupedSessions = sessions.reduce((acc, session) => {
        const classKey = session.className;
        if (!acc[classKey]) {
          acc[classKey] = {
            className: session.className,
            classGrade: session.classGrade,
            sessions: []
          };
        }
        acc[classKey].sessions.push(session);
        return acc;
      }, {});
    } else if (groupBy === 'subject') {
      // Group by subject
      groupedSessions = sessions.reduce((acc, session) => {
        const subjectId = session.subject._id.toString();
        if (!acc[subjectId]) {
          acc[subjectId] = {
            subject: session.subject,
            sessions: []
          };
        }
        acc[subjectId].sessions.push(session);
        return acc;
      }, {});
    }

    // Get comprehensive statistics
    const stats = await schedule.getStatistics();

    res.status(200).json({
      schedule,
      sessions: groupedSessions,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Update schedule
const updateSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates.school;
    delete updates.createdBy;
    delete updates.teacher; // Teacher should not be changed after creation

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      scheduleId,
      updates,
      { new: true, runValidators: true }
    ).populate('teacher', 'name email')
     .populate('createdBy', 'name email');

    if (!updatedSchedule) {
      return res.status(404).json({ message: 'Emploi du temps introuvable' });
    }

    res.status(200).json({
      message: 'Emploi du temps mis à jour avec succès',
      schedule: updatedSchedule
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Delete schedule (also deletes all associated sessions)
const deleteSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: 'Emploi du temps introuvable' });
    }

    // Delete all sessions associated with this schedule
    const deletedSessions = await Session.deleteMany({ schedule: scheduleId });

    // Delete the schedule
    await Schedule.findByIdAndDelete(scheduleId);

    res.status(200).json({
      message: 'Emploi du temps et toutes les sessions associées supprimés avec succès',
      deletedSessionsCount: deletedSessions.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Create a session for a schedule
const createSession = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const {
      sessionDate,
      startTime,
      endTime,
      className,
      classGrade,
      subjectId,
      sessionType,
      room,
      notes,
      weekType
    } = req.body;

    const creatorId = req.userId;
    const schoolId = req.schoolId;

    // Validate required fields
    if (!sessionDate || !startTime || !endTime || !className || !classGrade || !subjectId) {
      return res.status(400).json({
        message: 'La date de session, l\'heure de début, l\'heure de fin, le nom de la classe, le niveau de la classe et la matière sont requis'
      });
    }

    // Get the schedule and verify it exists
    const schedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name email');

    if (!schedule) {
      return res.status(404).json({ message: 'Emploi du temps introuvable' });
    }

    // Verify subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Matière introuvable' });
    }

    // Validate session date
    const sessionDateObj = new Date(sessionDate);
    if (isNaN(sessionDateObj.getTime())) {
      return res.status(400).json({ message: 'Date de session invalide' });
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        message: 'Format d\'heure invalide. Utilisez le format HH:MM'
      });
    }

    // Check if end time is after start time
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];

    if (endMinutes <= startMinutes) {
      return res.status(400).json({
        message: 'L\'heure de fin doit être après l\'heure de début'
      });
    }

    // Create the session
    const session = new Session({
      schedule: scheduleId,
      sessionDate: sessionDateObj,
      startTime,
      endTime,
      teacher: schedule.teacher._id,
      className: className.trim(),
      classGrade: classGrade.trim(),
      subject: subjectId,
      sessionType: sessionType || 'lecture',
      room,
      notes,
      weekType: weekType || schedule.weekType,
      school: schoolId,
      createdBy: creatorId
    });

    // Check for conflicts
    const conflicts = await session.hasTimeConflict();
    if (conflicts) {
      return res.status(409).json({
        message: 'Conflit d\'horaire détecté',
        conflicts: conflicts.map(c => ({
          teacher: c.teacher?.name || 'Inconnu',
          className: c.className,
          subject: c.subject?.name || 'Inconnu',
          time: `${c.startTime} - ${c.endTime}`,
          date: c.sessionDate.toISOString().split('T')[0],
          weekType: c.weekType
        }))
      });
    }

    const savedSession = await session.save();

    // Populate the response
    const populatedSession = await Session.findById(savedSession._id)
      .populate('teacher', 'name email')
      .populate('subject', 'name');

    res.status(201).json({
      message: 'Session créée avec succès',
      session: populatedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get class schedule - NEW ENDPOINT for students
const getClassSchedule = async (req, res) => {
  try {
    const { className } = req.params;
    const { startDate, endDate, weekType } = req.query;
    const schoolId = req.schoolId;

    if (!className) {
      return res.status(400).json({ message: 'Le nom de la classe est requis' });
    }

    // Build filter
    let sessionFilter = {
      className: { $regex: new RegExp(`^${className}$`, 'i') }, // Case insensitive
      school: schoolId,
      isActive: true,
      status: { $nin: ['cancelled'] }
    };

    // Add date range filter
    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    // If no date range provided, show all sessions (no date filter)

    // Add week type filter if provided
    if (weekType && weekType !== 'both') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Get sessions
    const sessions = await Session.find(sessionFilter)
      .populate('teacher', 'name email')
      .populate('subject', 'name')
      .populate('schedule', 'name')
      .sort({ sessionDate: 1, startTime: 1 });

    if (sessions.length === 0) {
      return res.status(404).json({
        message: 'Aucune session trouvée pour cette classe dans la période spécifiée'
      });
    }

    // Group sessions by date
    const groupedByDate = sessions.reduce((acc, session) => {
      const dateKey = session.sessionDate.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          dayOfWeek: session.dayOfWeek,
          sessions: []
        };
      }
      acc[dateKey].sessions.push({
        _id: session._id,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        teacher: session.teacher,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        notes: session.notes,
        weekType: session.weekType,
        status: session.getCurrentStatus()
      });
      return acc;
    }, {});

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      totalHours: sessions.reduce((sum, s) => sum + s.duration, 0) / 60,
      uniqueTeachers: new Set(sessions.map(s => s.teacher._id.toString())).size,
      uniqueSubjects: new Set(sessions.map(s => s.subject._id.toString())).size,
      sessionTypes: sessions.reduce((acc, s) => {
        acc[s.sessionType] = (acc[s.sessionType] || 0) + 1;
        return acc;
      }, {})
    };

    res.status(200).json({
      className: sessions[0].className,
      classGrade: sessions[0].classGrade,
      schedule: groupedByDate,
      statistics: stats,
      dateRange: {
        startDate: startDate || sessions[0].sessionDate.toISOString().split('T')[0],
        endDate: endDate || sessions[sessions.length - 1].sessionDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get all classes with their schedules - for admin overview
const getAllClassesSchedules = async (req, res) => {
  try {
    const { weekType, date } = req.query;
    const schoolId = req.schoolId;

    // Build filter
    let sessionFilter = {
      school: schoolId,
      isActive: true,
      status: { $nin: ['cancelled'] }
    };

    // Add date filter
    if (date) {
      sessionFilter.sessionDate = new Date(date);
    } else {
      // Default to today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      sessionFilter.sessionDate = { $gte: today };
    }

    // Add week type filter if provided
    if (weekType && weekType !== 'both') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Get all sessions grouped by class
    const sessions = await Session.find(sessionFilter)
      .populate('teacher', 'name email')
      .populate('subject', 'name')
      .sort({ className: 1, sessionDate: 1, startTime: 1 });

    // Group by class name
    const classesSessions = sessions.reduce((acc, session) => {
      const classKey = session.className;
      if (!acc[classKey]) {
        acc[classKey] = {
          className: session.className,
          classGrade: session.classGrade,
          sessions: []
        };
      }
      acc[classKey].sessions.push({
        _id: session._id,
        sessionDate: session.sessionDate,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        teacher: session.teacher,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        weekType: session.weekType,
        status: session.getCurrentStatus()
      });
      return acc;
    }, {});

    // Calculate overall statistics
    const stats = {
      totalClasses: Object.keys(classesSessions).length,
      totalSessions: sessions.length,
      totalHours: sessions.reduce((sum, s) => sum + s.duration, 0) / 60,
      uniqueTeachers: new Set(sessions.map(s => s.teacher._id.toString())).size,
      uniqueSubjects: new Set(sessions.map(s => s.subject._id.toString())).size
    };

    res.status(200).json({
      classes: classesSessions,
      statistics: stats,
      filters: { weekType, date }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get teacher's schedule with all sessions
const getTeacherSchedule = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { startDate, endDate } = req.query;
    const schoolId = req.schoolId;

    // Verify teacher exists
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      school: schoolId
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Enseignant introuvable' });
    }

    // Get teacher's schedule
    const schedule = await Schedule.findOne({
      teacher: teacherId,
      school: schoolId,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({
        message: 'Aucun emploi du temps actif trouvé pour cet enseignant'
      });
    }

    // Build session filter
    let sessionFilter = {
      schedule: schedule._id,
      isActive: true
    };

    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all sessions
    const sessions = await Session.find(sessionFilter)
      .populate('subject', 'name')
      .sort({ sessionDate: 1, startTime: 1 });

    // Group by date
    const groupedSessions = sessions.reduce((acc, session) => {
      const dateKey = session.sessionDate.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          dayOfWeek: session.dayOfWeek,
          sessions: []
        };
      }
      acc[dateKey].sessions.push(session);
      return acc;
    }, {});

    const stats = await schedule.getStatistics();

    res.status(200).json({
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email
      },
      schedule: {
        _id: schedule._id,
        name: schedule.name,
        weekType: schedule.weekType
      },
      sessions: groupedSessions,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Update session
const updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates.schedule;
    delete updates.school;
    delete updates.createdBy;
    delete updates.teacher; // Teacher should not be changed for individual sessions

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session introuvable' });
    }

    // If updating time, date, or class, check for conflicts
    if (updates.startTime || updates.endTime || updates.sessionDate || updates.className) {
      // Apply updates to check conflicts
      Object.assign(session, updates);

      const conflicts = await session.hasTimeConflict(sessionId);
      if (conflicts) {
        return res.status(409).json({
          message: 'Conflit d\'horaire détecté',
          conflicts: conflicts.map(c => ({
            teacher: c.teacher?.name || 'Inconnu',
            className: c.className,
            subject: c.subject?.name || 'Inconnu',
            time: `${c.startTime} - ${c.endTime}`,
            date: c.sessionDate.toISOString().split('T')[0],
            weekType: c.weekType
          }))
        });
      }
    }

    const updatedSession = await Session.findByIdAndUpdate(
      sessionId,
      updates,
      { new: true, runValidators: true }
    )
    .populate('teacher', 'name email')
    .populate('subject', 'name');

    if (!updatedSession) {
      return res.status(404).json({ message: 'Session introuvable' });
    }

    res.status(200).json({
      message: 'Session mise à jour avec succès',
      session: updatedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Delete a session
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deletedSession = await Session.findByIdAndDelete(sessionId);
    if (!deletedSession) {
      return res.status(404).json({ message: 'Session introuvable' });
    }

    res.status(200).json({
      message: 'Session supprimée avec succès',
      session: deletedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get all sessions for a schedule
const getScheduleSessions = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { startDate, endDate, className, subjectId, status } = req.query;

    let filter = { schedule: scheduleId, isActive: true };
    
    if (startDate && endDate) {
      filter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (className) filter.className = { $regex: new RegExp(className, 'i') };
    if (subjectId) filter.subject = subjectId;
    if (status) filter.status = status;

    const sessions = await Session.find(filter)
      .populate('subject', 'name')
      .sort({ sessionDate: 1, startTime: 1 });

    res.status(200).json({ sessions });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Clone schedule (deprecated - kept for backward compatibility)
const cloneScheduleToNewYear = async (req, res) => {
  try {
    return res.status(400).json({
      message: 'Le clonage d\'emploi du temps n\'est plus supporté. Chaque enseignant ne peut avoir qu\'un seul emploi du temps.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get schedule statistics
const getScheduleStatistics = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name email');

    if (!schedule) {
      return res.status(404).json({ message: 'Emploi du temps introuvable' });
    }

    const stats = await schedule.getStatistics();

    // Get additional detailed statistics
    const sessions = await Session.find({ 
      schedule: scheduleId, 
      isActive: true 
    }).populate('subject', 'name');

    const detailedStats = {
      ...stats,
      sessionsByDay: sessions.reduce((acc, s) => {
        acc[s.dayOfWeek] = (acc[s.dayOfWeek] || 0) + 1;
        return acc;
      }, {}),
      sessionsByType: sessions.reduce((acc, s) => {
        acc[s.sessionType] = (acc[s.sessionType] || 0) + 1;
        return acc;
      }, {}),
      classesList: [...new Set(sessions.map(s => s.className))],
      subjectsList: sessions.reduce((acc, s) => {
        if (!acc.find(sub => sub._id.toString() === s.subject._id.toString())) {
          acc.push(s.subject);
        }
        return acc;
      }, [])
    };

    res.status(200).json({
      schedule: {
        _id: schedule._id,
        name: schedule.name,
        teacher: schedule.teacher,
        weekType: schedule.weekType
      },
      statistics: detailedStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Generate schedule PDF
const generateSchedulePDF = async (req, res) => {
  try {
    const { teacher, sessions, generatedAt, totalSessions } = req.body;

    if (!teacher || !sessions || sessions.length === 0) {
      return res.status(400).json({
        message: 'Les informations de l\'enseignant et les sessions sont requises'
      });
    }

    // Create PDF document with UTF-8 support
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      bufferPages: true
    });

    // Register Arabic font
    const arabicFontPath = path.join(__dirname, '..', 'fonts', 'NotoSansArabic-Regular.ttf');

    // Check if Arabic font exists
    if (fs.existsSync(arabicFontPath)) {
      doc.registerFont('ArabicFont', arabicFontPath);
      doc.font('ArabicFont'); // Set as default font for the document
    } else {
      console.warn('Arabic font not found, using default font');
      doc.font('Helvetica');
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="emploi_du_temps_${teacher.name.replace(/\s+/g, '_')}.pdf"`);

    // Pipe the PDF to response
    doc.pipe(res);

    // PDF Header
    doc.fontSize(18).fillColor('#1e40af').text('EMPLOI DU TEMPS', { align: 'center' });
    doc.moveDown(0.5);

    // Header info box
    const headerY = doc.y;
    doc.rect(40, headerY, 515, 70).stroke('#d1d5db');

    doc.fontSize(12).fillColor('black')
       .text(`Enseignant: ${teacher.name}`, 60, headerY + 15)
       .text(`Total Sessions: ${totalSessions}`, 60, headerY + 40)
       .text(`Généré le: ${new Date(generatedAt).toLocaleDateString('fr-FR')}`, 350, headerY + 15);

    doc.y = headerY + 90;

    // Group sessions by day of week
    const sessionsByDay = sessions.reduce((acc, session) => {
      if (!acc[session.dayOfWeek]) {
        acc[session.dayOfWeek] = [];
      }
      acc[session.dayOfWeek].push(session);
      return acc;
    }, {});

    // Sort days (Monday to Saturday)
    const dayOrder = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const sortedDays = Object.keys(sessionsByDay).sort((a, b) => {
      return dayOrder.indexOf(a) - dayOrder.indexOf(b);
    });

    // Table styling
    const tableX = 40;
    const tableWidth = 515;
    const columnWidths = [80, 150, 120, 80, 85]; // Heure, Matière, Classe, Salle, Semaine
    const rowHeight = 25;

    // Draw schedule for each day
    for (const day of sortedDays) {
      const daySessions = sessionsByDay[day].sort((a, b) => {
        // Sort by start time
        const timeA = a.startTime.split(':').map(Number);
        const timeB = b.startTime.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });

      // Check for page break
      const neededHeight = 40 + (daySessions.length + 1) * rowHeight;
      if (doc.y + neededHeight > 750) {
        doc.addPage();
      }

      // Day header
      doc.fontSize(14).fillColor('#1e40af').text(day.toUpperCase(), tableX, doc.y);
      doc.moveDown(0.5);

      // Table header
      const tableStartY = doc.y;
      let currentX = tableX;

      // Header background
      doc.rect(tableX, tableStartY, tableWidth, rowHeight).fill('#f3f4f6').stroke('#d1d5db');

      // Header text
      doc.fillColor('black').fontSize(10);
      const headers = ['Heure', 'Matière', 'Classe', 'Salle', 'Semaine'];
      headers.forEach((header, index) => {
        doc.text(header, currentX + 5, tableStartY + 8, {
          width: columnWidths[index] - 10,
          align: 'center'
        });
        currentX += columnWidths[index];
      });

      // Table rows
      let currentY = tableStartY + rowHeight;

      daySessions.forEach((session, index) => {
        // Row background (alternating colors)
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(tableX, currentY, tableWidth, rowHeight).fill(bgColor).stroke('#d1d5db');

        currentX = tableX;
        doc.fillColor('black').fontSize(9);

        // Time
        doc.text(`${session.startTime} - ${session.endTime}`, currentX + 5, currentY + 8, {
          width: columnWidths[0] - 10,
          align: 'center'
        });
        currentX += columnWidths[0];

        // Subject - Keep Arabic characters intact
        const subjectText = (session.subject || 'Matière Inconnue')
          .toString()
          .substring(0, 50); // Limit length for table display

        doc.text(subjectText, currentX + 5, currentY + 5, {
          width: columnWidths[1] - 10,
          align: 'left',
          height: rowHeight - 10
        });
        currentX += columnWidths[1];

        // Class - Keep Arabic characters intact
        const className = (session.className || '').toString();
        const classGrade = (session.classGrade || '').toString();

        doc.text(`${className} (${classGrade})`, currentX + 5, currentY + 5, {
          width: columnWidths[2] - 10,
          align: 'left',
          height: rowHeight - 10
        });
        currentX += columnWidths[2];

        // Room - Keep Arabic characters intact
        const roomText = (session.room || '-').toString() || '-';
        doc.text(roomText, currentX + 5, currentY + 8, {
          width: columnWidths[3] - 10,
          align: 'center'
        });
        currentX += columnWidths[3];

        // Week type - Keep text intact
        const weekType = session.weekType || 'Toutes';
        const weekText = weekType !== 'Deux Semaines' ? weekType : 'Toutes';
        doc.text(weekText || 'Toutes', currentX + 5, currentY + 8, {
          width: columnWidths[4] - 10,
          align: 'center'
        });

        currentY += rowHeight;
      });

      doc.y = currentY + 20;
    }

    // Footer
    if (doc.y > 720) {
      doc.addPage();
    }

    doc.fontSize(9).fillColor('#6b7280')
       .text('Généré automatiquement par LearnLand', 40, 750, { align: 'center', width: 515 })
       .text(`© ${new Date().getFullYear()} LearnLand. Tous droits réservés.`, 40, 765, { align: 'center', width: 515 });

    // Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du PDF', error: error.message });
  }
};

module.exports = {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  createSession,
  getClassSchedule,
  getAllClassesSchedules,
  updateSession,
  deleteSession,
  getTeacherSchedule,
  cloneScheduleToNewYear,
  getScheduleStatistics,
  getScheduleSessions,
  generateSchedulePDF
};