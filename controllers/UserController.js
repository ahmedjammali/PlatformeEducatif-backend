// controllers/userController.js
const User = require('../models/User'); // Adjust path as needed
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d'
  });
};

// Create User (Admin/SuperAdmin only)
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, createBy } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Validate createBy for teacher and student roles
    if ((role === 'teacher' || role === 'student') && !createBy) {
      return res.status(400).json({ 
        message: 'createBy is required when role is teacher or student' 
      });
    }

    // If createBy is provided, verify that the creator exists
    if (createBy) {
      const creator = await User.findById(createBy);
      if (!creator) {
        return res.status(400).json({ message: 'Creator user not found' });
      }
    }

    // Create new user object
    const userData = {
      name,
      email,
      password, // Note: password will be hashed by the pre-save middleware in your model
      role: role || 'student'
    };

    // Add createBy if provided
    if (createBy) {
      userData.createBy = createBy;
    }

    // Create new user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: validationErrors 
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all users with filtering and pagination
const getAllUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 50, search } = req.query;
    
    // Build filter object
    let filter = {};
    if (role) {
      filter.role = role;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users with pagination and populate createBy
    const users = await User.find(filter)
      .select('-password')
      .populate('createBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
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
      .populate('createBy', 'name email role');
    
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
    const updates = req.body;

    // Don't allow password updates through this endpoint
    if (updates.password) {
      delete updates.password;
    }

    // Check if email is being updated and if it already exists
    if (updates.email) {
      const existingUser = await User.findOne({ 
        email: updates.email, 
        _id: { $ne: id } 
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // If role is being updated to teacher or student, ensure createBy is provided
    if (updates.role && (updates.role === 'teacher' || updates.role === 'student')) {
      const currentUser = await User.findById(id);
      if (!currentUser.createBy && !updates.createBy) {
        return res.status(400).json({ 
          message: 'createBy is required when role is teacher or student' 
        });
      }
    }

    // If createBy is being updated, verify that the creator exists
    if (updates.createBy) {
      const creator = await User.findById(updates.createBy);
      if (!creator) {
        return res.status(400).json({ message: 'Creator user not found' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('createBy', 'name email role');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: validationErrors 
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // First check if the user exists
    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If the user is an admin, delete all teachers and students they created
    if (userToDelete.role === 'admin') {
      await User.deleteMany({ 
        createBy: id,
        role: { $in: ['teacher', 'student'] } 
      });
    }

    // Now delete the admin
    const deletedUser = await User.findByIdAndDelete(id);

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
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await User.findByIdAndUpdate(id, { password: hashedNewPassword });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid Email' });
    }
    
    console.log(password, user.password);

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid Password' });
    }
    
    // Generate token
    const token = generateToken(user._id);

    // User response without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get users by role
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const validRoles = ['superadmin', 'admin', 'teacher', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    const skip = (page - 1) * limit;

    const users = await User.find({ role })
      .select('-password')
      .populate('createBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ role });

    res.status(200).json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user statistics
const getUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await User.countDocuments();

    const formattedStats = {
      totalUsers,
      byRole: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    res.status(200).json({ stats: formattedStats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get users created by a specific user with optional role filtering
const getUsersCreatedBy = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { role, page = 1, limit = 10, search } = req.query;

    // Verify that the creator exists
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator user not found' });
    }

    // Build filter object
    let filter = { createBy: creatorId };
    
    // Add role filter if specified
    if (role) {
      const validRoles = ['teacher', 'student'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ 
          message: 'Invalid role. Only teacher and student roles can be filtered for created users' 
        });
      }
      filter.role = role;
    }

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password')
      .populate('createBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      users,
      creator: {
        id: creator._id,
        name: creator.name,
        email: creator.email,
        role: creator.role
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get students created by a specific user
const getStudentsCreatedBy = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { page = 1, limit = 10, search } = req.query;

    // Verify that the creator exists
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator user not found' });
    }

    // Build filter object
    let filter = { 
      createBy: creatorId,
      role: 'student'
    };

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get students with pagination
    const students = await User.find(filter)
      .select('-password')
      .populate('createBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      students,
      creator: {
        id: creator._id,
        name: creator.name,
        email: creator.email,
        role: creator.role
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStudents: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get teachers created by a specific user
const getTeachersCreatedBy = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { page = 1, limit = 10, search } = req.query;

    // Verify that the creator exists
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator user not found' });
    }

    // Build filter object
    let filter = { 
      createBy: creatorId,
      role: 'teacher'
    };

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get teachers with pagination
    const teachers = await User.find(filter)
      .select('-password')
      .populate('createBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      teachers,
      creator: {
        id: creator._id,
        name: creator.name,
        email: creator.email,
        role: creator.role
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTeachers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get statistics of users created by a specific user
const getCreatedUsersStats = async (req, res) => {
  try {
    const { creatorId } = req.params;

    // Verify that the creator exists
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator user not found' });
    }

    // Aggregate statistics
    const stats = await User.aggregate([
      {
        $match: { createBy: mongoose.Types.ObjectId(creatorId) }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalCreatedUsers = await User.countDocuments({ createBy: creatorId });

    const formattedStats = {
      totalCreatedUsers,
      creator: {
        id: creator._id,
        name: creator.name,
        email: creator.email,
        role: creator.role
      },
      byRole: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    res.status(200).json({ stats: formattedStats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
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
};