// routes/userRoutes.js
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
  getProfile
} = require('../controllers/UserController');

const {
  authenticate,
  isAdminOrHigher,
  isTeacherOrHigher
} = require('../middleware/auth');

// Validation middleware
const validateUserCreation = (req, res, next) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email  || !role) {
    return res.status(400).json({ 
      message: 'Name, email, password, and role are required' 
    });
  }

  const validRoles = ['superadmin', 'admin', 'teacher', 'student'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({   
      message: 'Invalid role. Must be one of: ' + validRoles.join(', ') 
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

// Public routes
router.post('/login', validateLogin, login);

// Protected routes
router.use(authenticate);

// Profile routes
router.get('/profile', getProfile);

// User management routes
router.post('/', isAdminOrHigher, validateUserCreation, createUser);
router.get('/', isTeacherOrHigher, getAllUsers);
router.get('/:id', isTeacherOrHigher, getUserById);
router.put('/:id', isAdminOrHigher, updateUser);
router.delete('/:id', isAdminOrHigher, deleteUser);
router.put('/:id/password', validatePasswordChange, changePassword);

module.exports = router;