// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const School = require('../models/School');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId)
      .select('-password')
      .populate('school')
      .populate('studentClass', 'name grade level');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User not found.' });
    }

    // Check if user has access (school might be blocked)
    const hasAccess = await user.hasAccess();
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. Your school access has been blocked.',
        isBlocked: true
      });
    }

    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    req.schoolId = user.school?._id;
    
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

// Authorization middleware for different roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

const isSuperAdmin = authorize('superadmin');
const isAdmin = authorize('admin');
const isAdminOrHigher = authorize('superadmin', 'admin');
const isTeacher = authorize('teacher');
const isTeacherOrHigher = authorize('superadmin', 'admin', 'teacher');
const isStudent = authorize('student');

// Check if user belongs to the same school (for multi-tenancy)
const belongsToSameSchool = async (req, res, next) => {
  try {
    // SuperAdmin can access any school
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Get the target resource's school ID based on the route
    let targetSchoolId;
    
    // Determine school ID based on different scenarios
    if (req.params.schoolId) {
      targetSchoolId = req.params.schoolId;
    } else if (req.body.school) {
      targetSchoolId = req.body.school;
    } else if (req.params.userId) {
      const targetUser = await User.findById(req.params.userId);
      targetSchoolId = targetUser?.school;
    } else if (req.params.classId) {
      const Class = require('../models/Class');
      const targetClass = await Class.findById(req.params.classId);
      targetSchoolId = targetClass?.school;
    }

    // Check if user belongs to the same school
    if (targetSchoolId && req.schoolId.toString() !== targetSchoolId.toString()) {
      return res.status(403).json({ 
        message: 'Access denied. You can only access resources from your school.' 
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if teacher can access specific class
const canAccessClass = async (req, res, next) => {
  try {
    const classId = req.params.classId || req.body.class;
    
    // SuperAdmin and Admin can access any class in their school
    if (['superadmin', 'admin'].includes(req.user.role)) {
      return next();
    }

    if (req.user.role === 'teacher') {
      const Class = require('../models/Class');
      const targetClass = await Class.findById(classId);
      
      if (!targetClass) {
        return res.status(404).json({ message: 'Class not found' });
      }

      // Check if teacher teaches this class
      const teachesClass = targetClass.teacherSubjects.some(
        ts => ts.teacher.toString() === req.userId.toString()
      );

      if (!teachesClass) {
        return res.status(403).json({ 
          message: 'Access denied. You do not teach this class.' 
        });
      }
    }

    if (req.user.role === 'student') {
      // Check if student belongs to this class
      if (req.user.studentClass?.toString() !== classId) {
        return res.status(403).json({ 
          message: 'Access denied. You do not belong to this class.' 
        });
      }
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if teacher can manage specific subject in a class
const canManageSubjectInClass = async (req, res, next) => {
  try {
    const { classId, subjectId } = req.params;
    
    // SuperAdmin and Admin can manage any subject
    if (['superadmin', 'admin'].includes(req.user.role)) {
      return next();
    }

    if (req.user.role === 'teacher') {
      const Class = require('../models/Class');
      const targetClass = await Class.findById(classId);
      
      if (!targetClass) {
        return res.status(404).json({ message: 'Class not found' });
      }

      // Find teacher's entry in the class
      const teacherEntry = targetClass.teacherSubjects.find(
        ts => ts.teacher.toString() === req.userId.toString()
      );

      if (!teacherEntry) {
        return res.status(403).json({ 
          message: 'Access denied. You do not teach this class.' 
        });
      }

      // Check if teacher teaches this specific subject
      const teachesSubject = teacherEntry.subjects.some(
        s => s.toString() === subjectId
      );

      if (!teachesSubject) {
        return res.status(403).json({ 
          message: 'Access denied. You do not teach this subject in this class.' 
        });
      }
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if user can access their own data or has admin privileges
const canAccessUserData = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    
    // SuperAdmin can access any user's data
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Admin can access users in their school
    if (req.user.role === 'admin') {
      const targetUser = await User.findById(targetUserId);
      if (targetUser && targetUser.school?.toString() === req.schoolId?.toString()) {
        return next();
      }
      return res.status(403).json({ 
        message: 'Access denied. You can only access users from your school.' 
      });
    }

    // Users can only access their own data
    if (req.userId.toString() === targetUserId) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied. You can only access your own data.' 
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  authenticate,
  authorize,
  isSuperAdmin,
  isAdmin,
  isAdminOrHigher,
  isTeacher,
  isTeacherOrHigher,
  isStudent,
  belongsToSameSchool,
  canAccessClass,
  canManageSubjectInClass,
  canAccessUserData
};