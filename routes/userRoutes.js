// routes/userRoutes.js - Updated with createBy validation
const express = require('express');
const router = express.Router();
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  changePassword,
  login,
  getUsersByRole,
  getUserStats,
  getUsersCreatedBy,
  getStudentsCreatedBy,
  getTeachersCreatedBy,
  getCreatedUsersStats
} = require('../controllers/UserController');

const {
  authenticate,
  canManageUsers,
  isSuperAdmin,
  isAdminOrHigher,
  isTeacherOrHigher,
  canAccessUserData
} = require('../middleware/auth');

// Validation middleware
const validateUserCreation = (req, res, next) => {
  const { name, email, password, role, createBy } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ 
      message: 'Name, email, and password are required' 
    });
  }

  const validRoles = ['superadmin', 'admin', 'teacher', 'student'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ 
      message: 'Invalid role. Must be one of: ' + validRoles.join(', ') 
    });
  }

  // Check if createBy is required for teacher/student roles
  if ((role === 'teacher' || role === 'student') && !createBy) {
    return res.status(400).json({ 
      message: 'createBy is required when role is teacher or student' 
    });
  }

  // Only superadmin can create other superadmins
  if (role === 'superadmin' && req.user && req.user.role !== 'superadmin') {
    return res.status(403).json({ 
      message: 'Only superadmin can create superadmin accounts' 
    });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ 
      message: 'Email and password are required' 
    });
  }

  next();
};

const validatePasswordChange = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      message: 'Current password and new password are required' 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      message: 'New password must be at least 6 characters long' 
    });
  }

  next();
};

// Middleware to automatically set createBy for specific role routes
const setCreateByFromAuthenticatedUser = (req, res, next) => {
  if (req.user && req.user.userId) {
    req.body.createBy = req.user.userId;
  }
  next();
};

// Public routes
router.post('/login', validateLogin, login);

// Protected routes
router.use(authenticate); // All routes below require authentication

// User management routes (Admin/SuperAdmin only)
router.post('/', canManageUsers, validateUserCreation, createUser);
router.get('/', isAdminOrHigher, getAllUsers);
router.get('/stats', isAdminOrHigher, getUserStats);

// Specific role creation routes (for easier testing) - MOVED BEFORE parameterized routes
router.post('/superadmin', isSuperAdmin, validateUserCreation, (req, res, next) => {
  req.body.role = 'superadmin';
  next();
}, createUser);

router.post('/admin', isSuperAdmin, validateUserCreation, (req, res, next) => {
  req.body.role = 'admin';
  next();
}, createUser);

router.post('/teacher', isAdminOrHigher, setCreateByFromAuthenticatedUser, validateUserCreation, (req, res, next) => {
  req.body.role = 'teacher';
  next();
}, createUser);

router.post('/student', isTeacherOrHigher, setCreateByFromAuthenticatedUser, validateUserCreation, (req, res, next) => {
  req.body.role = 'student';
  next();
}, createUser);

// Role-based routes - MOVED BEFORE parameterized routes
router.get('/role/:role', isTeacherOrHigher, getUsersByRole);

// Routes for getting users created by specific user
router.get('/created-by/:creatorId', isTeacherOrHigher, getUsersCreatedBy);
router.get('/created-by/:creatorId/students', isTeacherOrHigher, getStudentsCreatedBy);
router.get('/created-by/:creatorId/teachers', isAdminOrHigher, getTeachersCreatedBy);
router.get('/created-by/:creatorId/stats', isTeacherOrHigher, getCreatedUsersStats);

// Individual user routes - MOVED TO END
router.get('/:id', canAccessUserData, getUserById);
router.put('/:id', canAccessUserData, updateUser);
router.delete('/:id', canManageUsers, deleteUser);
router.put('/:id/change-password', canAccessUserData, validatePasswordChange, changePassword);

module.exports = router;