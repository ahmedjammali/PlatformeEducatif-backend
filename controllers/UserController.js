// controllers/userController.js
const User = require('../models/User');
const School = require('../models/School');
const jwt = require('jsonwebtoken');
const Class = require('../models/Class');

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d'
  });
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user and populate school
    const user = await User.findOne({ email }).populate('school');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user has access
    const hasAccess = await user.hasAccess();
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. School access has been blocked.'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // User response without password
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      school: user.school
    };

    res.status(200).json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create User (Admin creates teachers/students, SuperAdmin creates admin)
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const creatorId = req.userId;
    const creatorRole = req.userRole;

    // Validation: Check role hierarchy
    if (creatorRole === 'superadmin' && role !== 'admin') {
      return res.status(403).json({ 
        message: 'SuperAdmin can only create admin accounts' 
      });
    }
    
    if (creatorRole === 'admin' && !['teacher', 'student'].includes(role)) {
      return res.status(403).json({ 
        message: 'Admin can only create teacher and student accounts' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }

    // Get school
    let schoolId = req.schoolId;
    if (role === 'admin') {
      const school = await School.findOne();
      schoolId = school?._id;
    }

    // Create user
    const newUser = new User({
      name,
      email,
      password,
      role,
      createdBy: creatorId,
      school: role !== 'superadmin' ? schoolId : undefined
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      message: `${role} account created successfully`,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all users (filtered by role and requester's permissions)
const getAllUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 50 } = req.query;
    const userRole = req.userRole;
    const schoolId = req.schoolId;
    
    let filter = {};

    // SuperAdmin sees all users
    // Admin sees only users in their school
    // Teachers see only students
    if (userRole === 'admin' ) {
      filter.school = schoolId;
      if (role) filter.role = role;
    } else if (userRole === 'teacher') {
      filter.school = schoolId;
      filter.role = 'student';
    }

    if (role) filter.role = role;

    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .select('-password')
      .populate('studentClass', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.status(200).json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .select('-password')
      .populate('school', 'name')
      .populate('studentClass', 'name')
      .populate('teachingClasses.class', 'name')
      .populate('teachingClasses.subjects', 'name')
      .populate('createdBy', 'name');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    // Check if email is being updated and already exists
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: id } 
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting the only admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount === 1) {
        return res.status(400).json({ 
          message: 'Cannot delete the only admin account' 
        });
      }
    }

    // Clean up class associations based on user role
    if (user.role === 'teacher') {
      // Remove teacher from all classes they teach
      await Class.updateMany(
        { 'teacherSubjects.teacher': id },
        { $pull: { teacherSubjects: { teacher: id } } }
      );
    } else if (user.role === 'student') {
      // Remove student from their class
      if (user.studentClass) {
        await Class.findByIdAndUpdate(
          user.studentClass,
          { $pull: { students: id } }
        );
      }
    }

    // Delete the user
    await User.findByIdAndDelete(id);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .populate('school', 'name')
      .populate('studentClass', 'name')
      .populate('teachingClasses.class', 'name')
      .populate('teachingClasses.subjects', 'name');

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  login,
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  changePassword,
  getProfile
};