// controllers/timetableController.js
const Session = require('../models/Session');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const Class = require('../models/Class');

// Get teacher's timetable (updated for new session structure)
const getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.userRole === 'teacher' ? req.userId : req.params.teacherId;
    const { weekType = 'both', academicYear, startDate, endDate } = req.query;

    // Verify teacher exists and belongs to the same school
    const teacher = await User.findOne({ 
      _id: teacherId, 
      role: 'teacher',
      school: req.schoolId 
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Build filter for sessions
    let sessionFilter = {
      teacher: teacherId,
      isActive: true,
      school: req.schoolId,
      status: { $nin: ['cancelled'] }
    };

    // Handle week type filtering
    if (weekType === 'A' || weekType === 'B') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Add date range filter
    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current week
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      sessionFilter.sessionDate = {
        $gte: startOfWeek,
        $lte: endOfWeek
      };
    }

    // Add academic year filter if provided
    if (academicYear) {
      const schedules = await Schedule.find({ 
        academicYear, 
        school: req.schoolId,
        isActive: true 
      }).select('_id');
      sessionFilter.schedule = { $in: schedules.map(s => s._id) };
    }

    // Get all sessions for this teacher
    const sessions = await Session.find(sessionFilter)
      .populate('subject', 'name')
      .populate('schedule', 'name academicYear weekType')
      .sort({ sessionDate: 1, startTime: 1 });

    // Group sessions by day of week
    const timetable = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    };

    sessions.forEach(session => {
      timetable[session.dayOfWeek].push({
        _id: session._id,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        className: session.className,
        classGrade: session.classGrade,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        notes: session.notes,
        weekType: session.weekType,
        schedule: session.schedule,
        status: session.getCurrentStatus()
      });
    });

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      totalHours: sessions.reduce((total, session) => total + session.duration, 0) / 60,
      classesCount: new Set(sessions.map(s => s.className)).size,
      subjectsCount: new Set(sessions.map(s => s.subject._id.toString())).size,
      weekTypeDistribution: {
        A: sessions.filter(s => s.weekType === 'A').length,
        B: sessions.filter(s => s.weekType === 'B').length,
        both: sessions.filter(s => s.weekType === 'both').length
      },
      upcomingSessions: sessions.filter(s => s.getCurrentStatus() === 'upcoming').length,
      ongoingSessions: sessions.filter(s => s.getCurrentStatus() === 'ongoing').length
    };

    res.status(200).json({
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email
      },
      timetable,
      statistics: stats,
      weekType,
      academicYear,
      dateRange: {
        startDate: startDate || sessionFilter.sessionDate.$gte.toISOString().split('T')[0],
        endDate: endDate || sessionFilter.sessionDate.$lte.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get student's class timetable (updated for new session structure)
const getStudentTimetable = async (req, res) => {
  try {
    const studentId = req.userRole === 'student' ? req.userId : req.params.studentId;
    const { weekType = 'both', academicYear, startDate, endDate } = req.query;

    // Get student and their class
    const student = await User.findOne({ 
      _id: studentId, 
      role: 'student',
      school: req.schoolId 
    }).populate('studentClass', 'name grade');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let className;
    if (student.studentClass) {
      className = student.studentClass.name;
    } else if (student.className) {
      className = student.className; // Direct class name assignment
    } else {
      return res.status(404).json({ 
        message: 'Student is not assigned to any class' 
      });
    }

    // Build filter for sessions
    let sessionFilter = {
      className: { $regex: new RegExp(`^${className}$`, 'i') },
      isActive: true,
      school: req.schoolId,
      status: { $nin: ['cancelled'] }
    };

    // Handle week type filtering
    if (weekType === 'A' || weekType === 'B') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Add date range filter
    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current week
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      sessionFilter.sessionDate = {
        $gte: startOfWeek,
        $lte: endOfWeek
      };
    }

    // Add academic year filter if provided
    if (academicYear) {
      const schedules = await Schedule.find({ 
        academicYear, 
        school: req.schoolId,
        isActive: true 
      }).select('_id');
      sessionFilter.schedule = { $in: schedules.map(s => s._id) };
    }

    // Get all sessions for this class
    const sessions = await Session.find(sessionFilter)
      .populate('teacher', 'name email')
      .populate('subject', 'name')
      .populate('schedule', 'name academicYear weekType')
      .sort({ sessionDate: 1, startTime: 1 });

    // Group sessions by day of week
    const timetable = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    };

    sessions.forEach(session => {
      timetable[session.dayOfWeek].push({
        _id: session._id,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        teacher: session.teacher,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        notes: session.notes,
        weekType: session.weekType,
        schedule: session.schedule,
        status: session.getCurrentStatus()
      });
    });

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      totalHours: sessions.reduce((total, session) => total + session.duration, 0) / 60,
      teachersCount: new Set(sessions.map(s => s.teacher._id.toString())).size,
      subjectsCount: new Set(sessions.map(s => s.subject._id.toString())).size,
      weekTypeDistribution: {
        A: sessions.filter(s => s.weekType === 'A').length,
        B: sessions.filter(s => s.weekType === 'B').length,
        both: sessions.filter(s => s.weekType === 'both').length
      },
      upcomingSessions: sessions.filter(s => s.getCurrentStatus() === 'upcoming').length,
      ongoingSessions: sessions.filter(s => s.getCurrentStatus() === 'ongoing').length
    };

    res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email
      },
      class: {
        name: className,
        grade: student.studentClass?.grade || student.classGrade || 'Unknown'
      },
      timetable,
      statistics: stats,
      weekType,
      academicYear,
      dateRange: {
        startDate: startDate || sessionFilter.sessionDate.$gte.toISOString().split('T')[0],
        endDate: endDate || sessionFilter.sessionDate.$lte.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class timetable (for admins to view any class) - updated for new structure
const getClassTimetable = async (req, res) => {
  try {
    const { classId } = req.params;
    const { weekType = 'both', academicYear, startDate, endDate } = req.query;

    // This function now works with both Class ObjectId and className string
    let className;
    let classData;

    // Try to find as ObjectId first
    if (/^[0-9a-fA-F]{24}$/.test(classId)) {
      classData = await Class.findOne({ 
        _id: classId, 
        school: req.schoolId 
      });
      if (classData) {
        className = classData.name;
      }
    }

    // If not found as ObjectId, treat as className
    if (!className) {
      className = classId;
    }

    // Build filter for sessions
    let sessionFilter = {
      className: { $regex: new RegExp(`^${className}$`, 'i') },
      isActive: true,
      school: req.schoolId,
      status: { $nin: ['cancelled'] }
    };

    // Handle week type filtering
    if (weekType === 'A' || weekType === 'B') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Add date range filter
    if (startDate && endDate) {
      sessionFilter.sessionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current week
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      sessionFilter.sessionDate = {
        $gte: startOfWeek,
        $lte: endOfWeek
      };
    }

    // Add academic year filter if provided
    if (academicYear) {
      const schedules = await Schedule.find({ 
        academicYear, 
        school: req.schoolId,
        isActive: true 
      }).select('_id');
      sessionFilter.schedule = { $in: schedules.map(s => s._id) };
    }

    // Get all sessions for this class
    const sessions = await Session.find(sessionFilter)
      .populate('teacher', 'name email')
      .populate('subject', 'name')
      .populate('schedule', 'name academicYear weekType')
      .sort({ sessionDate: 1, startTime: 1 });

    if (sessions.length === 0) {
      return res.status(404).json({ 
        message: 'No sessions found for this class in the specified period' 
      });
    }

    // Group sessions by day of week
    const timetable = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    };

    sessions.forEach(session => {
      timetable[session.dayOfWeek].push({
        _id: session._id,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        teacher: session.teacher,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        notes: session.notes,
        weekType: session.weekType,
        schedule: session.schedule,
        status: session.getCurrentStatus()
      });
    });

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      totalHours: sessions.reduce((total, session) => total + session.duration, 0) / 60,
      teachersCount: new Set(sessions.map(s => s.teacher._id.toString())).size,
      subjectsCount: new Set(sessions.map(s => s.subject._id.toString())).size,
      weekTypeDistribution: {
        A: sessions.filter(s => s.weekType === 'A').length,
        B: sessions.filter(s => s.weekType === 'B').length,
        both: sessions.filter(s => s.weekType === 'both').length
      }
    };

    res.status(200).json({
      class: {
        _id: classData?._id || null,
        name: className,
        grade: classData?.grade || sessions[0]?.classGrade || 'Unknown'
      },
      timetable,
      statistics: stats,
      weekType,
      academicYear,
      dateRange: {
        startDate: startDate || sessionFilter.sessionDate.$gte.toISOString().split('T')[0],
        endDate: endDate || sessionFilter.sessionDate.$lte.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get current week type helper function
const getCurrentWeekType = (req, res) => {
  try {
    // Get current date
    const now = new Date();
    
    // Calculate which week of the academic year we're in
    // Assuming academic year starts in September
    const currentYear = now.getFullYear();
    const academicYearStart = new Date(currentYear, 8, 1); // September 1st
    
    // If we're before September, we're in the previous academic year
    if (now < academicYearStart) {
      academicYearStart.setFullYear(currentYear - 1);
    }
    
    // Calculate week number since academic year start
    const weeksSinceStart = Math.floor((now - academicYearStart) / (7 * 24 * 60 * 60 * 1000));
    
    // Alternate between A and B weeks
    const currentWeekType = weeksSinceStart % 2 === 0 ? 'A' : 'B';
    
    res.status(200).json({
      currentWeekType,
      weekNumber: weeksSinceStart + 1,
      academicYear: academicYearStart.getFullYear().toString(),
      currentDate: now.toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get weekly schedule for dashboard (updated for new structure)
const getWeeklySchedule = async (req, res) => {
  try {
    const { weekType, academicYear, date } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;
    const schoolId = req.schoolId;

    // Determine the target date
    const targetDate = date ? new Date(date) : new Date();
    
    // Calculate week start and end
    const startOfWeek = new Date(targetDate);
    startOfWeek.setDate(targetDate.getDate() - targetDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    let sessionFilter = {
      isActive: true,
      school: schoolId,
      sessionDate: {
        $gte: startOfWeek,
        $lte: endOfWeek
      },
      status: { $nin: ['cancelled'] }
    };

    // Handle week type filtering
    if (weekType === 'A' || weekType === 'B') {
      sessionFilter.$or = [
        { weekType: weekType },
        { weekType: 'both' }
      ];
    }

    // Add academic year filter if provided
    if (academicYear) {
      const schedules = await Schedule.find({ 
        academicYear, 
        school: schoolId,
        isActive: true 
      }).select('_id');
      sessionFilter.schedule = { $in: schedules.map(s => s._id) };
    }

    // Filter based on user role
    if (userRole === 'teacher') {
      sessionFilter.teacher = userId;
    } else if (userRole === 'student') {
      const student = await User.findById(userId).populate('studentClass');
      let className;
      if (student.studentClass) {
        className = student.studentClass.name;
      } else if (student.className) {
        className = student.className;
      } else {
        return res.status(200).json({ sessions: [] });
      }
      sessionFilter.className = { $regex: new RegExp(`^${className}$`, 'i') };
    }

    // Get sessions for the week
    const sessions = await Session.find(sessionFilter)
      .populate('teacher', 'name email')
      .populate('subject', 'name')
      .sort({ sessionDate: 1, startTime: 1 });

    // Group by day
    const weeklySchedule = sessions.reduce((acc, session) => {
      if (!acc[session.dayOfWeek]) {
        acc[session.dayOfWeek] = [];
      }
      acc[session.dayOfWeek].push({
        _id: session._id,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getFormattedDuration(),
        teacher: session.teacher,
        className: session.className,
        classGrade: session.classGrade,
        subject: session.subject,
        sessionType: session.sessionType,
        room: session.room,
        weekType: session.weekType,
        status: session.getCurrentStatus()
      });
      return acc;
    }, {});

    res.status(200).json({
      weeklySchedule,
      totalSessions: sessions.length,
      weekType,
      academicYear,
      weekRange: {
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getTeacherTimetable,
  getStudentTimetable,
  getClassTimetable,
  getCurrentWeekType,
  getWeeklySchedule
};