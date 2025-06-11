// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path as needed

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User not found.' });
    }

    req.user = user;
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

// Check if user can manage other users (superadmin and admin only)
const canManageUsers = authorize('superadmin', 'admin');

// Check if user is superadmin
const isSuperAdmin = authorize('superadmin');

// Check if user is admin or higher
const isAdminOrHigher = authorize('superadmin', 'admin');

// Check if user is teacher or higher
const isTeacherOrHigher = authorize('superadmin', 'admin', 'teacher');

// Check if user can access their own data or has admin privileges
const canAccessUserData = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // SuperAdmin and Admin can access any user's data
    if (['superadmin', 'admin'].includes(currentUser.role)) {
      return next();
    }

    // Users can only access their own data
    if (currentUser._id.toString() === id) {
      return next();
    }

    // Teachers can access student data (optional - adjust based on your requirements)
    if (currentUser.role === 'teacher') {
      const targetUser = await User.findById(id);
      if (targetUser && targetUser.role === 'student') {
        return next();
      }
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
  canManageUsers,
  isSuperAdmin,
  isAdminOrHigher,
  isTeacherOrHigher,
  canAccessUserData
};