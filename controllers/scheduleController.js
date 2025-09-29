// controllers/scheduleController.js
const Schedule = require('../models/Schedule');
const Session = require('../models/Session');
const User = require('../models/User');
const Class = require('../models/Class');
const Subject = require('../models/Subject');

// Create a new schedule for a specific teacher (Admin/SuperAdmin only)
const createSchedule = async (req, res) => {
  try {
    const { name, teacherId, weekType, academicYear, description } = req.body;
    const creatorId = req.userId;
    const schoolId = req.schoolId;

    // Validate input
    if (!name || !teacherId || !weekType || !academicYear) {
      return res.status(400).json({ 
        message: 'Name, teacher ID, week type, and academic year are required' 
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
        message: 'Teacher not found or does not belong to your school' 
      });
    }

    // Check if schedule already exists for this teacher in this academic year
    const existingSchedule = await Schedule.findOne({
      teacher: teacherId,
      academicYear,
      school: schoolId,
      isActive: true
    });

    if (existingSchedule) {
      return res.status(400).json({ 
        message: 'An active schedule already exists for this teacher in this academic year' 
      });
    }

    const schedule = new Schedule({
      name,
      teacher: teacherId,
      weekType,
      academicYear,
      description,
      school: schoolId,
      createdBy: creatorId
    });

    const savedSchedule = await schedule.save();
    await savedSchedule.populate('teacher', 'name email');

    res.status(201).json({
      message: 'Schedule created successfully',
      schedule: savedSchedule
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all schedules with teacher information
const getAllSchedules = async (req, res) => {
  try {
    const { page = 1, limit = 50, academicYear, weekType, teacherId, status } = req.query;
    const schoolId = req.schoolId;
    
    let filter = { school: schoolId };
    
    if (academicYear) filter.academicYear = academicYear;
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(404).json({ message: 'Schedule not found' });
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(404).json({ message: 'Schedule not found' });
    }

    res.status(200).json({
      message: 'Schedule updated successfully',
      schedule: updatedSchedule
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete schedule (also deletes all associated sessions)
const deleteSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Delete all sessions associated with this schedule
    const deletedSessions = await Session.deleteMany({ schedule: scheduleId });

    // Delete the schedule
    await Schedule.findByIdAndDelete(scheduleId);

    res.status(200).json({
      message: 'Schedule and all associated sessions deleted successfully',
      deletedSessionsCount: deletedSessions.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
        message: 'Session date, start time, end time, class name, class grade, and subject are required' 
      });
    }

    // Get the schedule and verify it exists
    const schedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name email');

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Verify subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Validate session date
    const sessionDateObj = new Date(sessionDate);
    if (isNaN(sessionDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid session date' });
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({ 
        message: 'Invalid time format. Use HH:MM format' 
      });
    }

    // Check if end time is after start time
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];

    if (endMinutes <= startMinutes) {
      return res.status(400).json({ 
        message: 'End time must be after start time' 
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
        message: 'Time conflict detected',
        conflicts: conflicts.map(c => ({
          teacher: c.teacher?.name || 'Unknown',
          className: c.className,
          subject: c.subject?.name || 'Unknown',
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
      message: 'Session created successfully',
      session: populatedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class schedule - NEW ENDPOINT for students
const getClassSchedule = async (req, res) => {
  try {
    const { className } = req.params;
    const { startDate, endDate, weekType, academicYear } = req.query;
    const schoolId = req.schoolId;

    if (!className) {
      return res.status(400).json({ message: 'Class name is required' });
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
    } else {
      // Default to current week if no dates provided
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      sessionFilter.sessionDate = {
        $gte: startOfWeek,
        $lte: endOfWeek
      };
    }

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
      .populate('schedule', 'name academicYear')
      .sort({ sessionDate: 1, startTime: 1 });

    if (sessions.length === 0) {
      return res.status(404).json({ 
        message: 'No sessions found for this class in the specified period' 
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all classes with their schedules - for admin overview
const getAllClassesSchedules = async (req, res) => {
  try {
    const { academicYear, weekType, date } = req.query;
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
      filters: { academicYear, weekType, date }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get teacher's schedule with all sessions
const getTeacherSchedule = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { startDate, endDate, academicYear } = req.query;
    const schoolId = req.schoolId;

    // Verify teacher exists
    const teacher = await User.findOne({ 
      _id: teacherId, 
      role: 'teacher', 
      school: schoolId 
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Get teacher's schedule
    let scheduleFilter = {
      teacher: teacherId,
      school: schoolId,
      isActive: true
    };

    if (academicYear) {
      scheduleFilter.academicYear = academicYear;
    }

    const schedule = await Schedule.findOne(scheduleFilter);
    if (!schedule) {
      return res.status(404).json({ 
        message: 'No active schedule found for this teacher' 
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
        academicYear: schedule.academicYear,
        weekType: schedule.weekType
      },
      sessions: groupedSessions,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(404).json({ message: 'Session not found' });
    }

    // If updating time, date, or class, check for conflicts
    if (updates.startTime || updates.endTime || updates.sessionDate || updates.className) {
      // Apply updates to check conflicts
      Object.assign(session, updates);
      
      const conflicts = await session.hasTimeConflict(sessionId);
      if (conflicts) {
        return res.status(409).json({ 
          message: 'Time conflict detected',
          conflicts: conflicts.map(c => ({
            teacher: c.teacher?.name || 'Unknown',
            className: c.className,
            subject: c.subject?.name || 'Unknown',
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
      return res.status(404).json({ message: 'Session not found' });
    }

    res.status(200).json({
      message: 'Session updated successfully',
      session: updatedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete a session
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deletedSession = await Session.findByIdAndDelete(sessionId);
    if (!deletedSession) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.status(200).json({ 
      message: 'Session deleted successfully',
      session: deletedSession
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Clone schedule to new academic year
const cloneScheduleToNewYear = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { newAcademicYear, newName } = req.body;
    const creatorId = req.userId;
    const schoolId = req.schoolId;

    if (!newAcademicYear) {
      return res.status(400).json({ 
        message: 'New academic year is required' 
      });
    }

    // Get the original schedule
    const originalSchedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name');
    
    if (!originalSchedule) {
      return res.status(404).json({ message: 'Original schedule not found' });
    }

    // Check if schedule already exists for this teacher in new academic year
    const existingSchedule = await Schedule.findOne({
      teacher: originalSchedule.teacher._id,
      academicYear: newAcademicYear,
      school: schoolId,
      isActive: true
    });

    if (existingSchedule) {
      return res.status(400).json({ 
        message: 'Schedule already exists for this teacher in the target academic year' 
      });
    }

    // Create new schedule
    const scheduleName = newName || `${originalSchedule.name} - ${newAcademicYear}`;
    const newSchedule = new Schedule({
      name: scheduleName,
      teacher: originalSchedule.teacher._id,
      weekType: originalSchedule.weekType,
      academicYear: newAcademicYear,
      description: originalSchedule.description,
      school: schoolId,
      createdBy: creatorId
    });

    const savedSchedule = await newSchedule.save();

    res.status(201).json({
      message: 'Schedule template created successfully. You can now add sessions for the new academic year.',
      schedule: savedSchedule,
      originalTeacher: originalSchedule.teacher.name
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get schedule statistics
const getScheduleStatistics = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await Schedule.findById(scheduleId)
      .populate('teacher', 'name email');
    
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
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
        academicYear: schedule.academicYear,
        weekType: schedule.weekType
      },
      statistics: detailedStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
  getScheduleSessions
};