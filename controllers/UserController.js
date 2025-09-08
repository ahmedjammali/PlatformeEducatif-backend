// controllers/userController.js
const User = require('../models/User');
const School = require('../models/School');
const jwt = require('jsonwebtoken');
const Class = require('../models/Class');
const Exercise = require('../models/Exercise');
const Grade = require('../models/Grade');
const StudentProgress = require('../models/StudentProgress');
const StudentPayment = require('../models/StudentPayment');

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

    // Check password - for admin/superadmin roles
    if (['admin', 'superadmin'].includes(user.role)) {
      if (!password) {
        return res.status(401).json({ message: 'Password is required for admin accounts' });
      }
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
    } else {
      // For teacher/student, check password only if they have one
      if (user.password && password) {
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }
      } else if (user.password && !password) {
        return res.status(401).json({ message: 'Password is required' });
      }
      // If no password set for teacher/student, allow login without password
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
      school: user.school,
      ...(user.role === 'teacher' && { phoneNumber: user.phoneNumber }),
      ...(user.role === 'student' && { 
        parentName: user.parentName,
        parentCin: user.parentCin,
        parentPhoneNumber: user.parentPhoneNumber
      })
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

// Create User (Admin creates teachers/students, SuperAdmin creates any role)
const createUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      role, 
      phoneNumber,
      parentName,
      parentCin,
      parentPhoneNumber
    } = req.body;
    const creatorId = req.userId;
    const creatorRole = req.userRole;

    // Validation: Check role hierarchy
    if (creatorRole === 'admin' && !['teacher', 'student'].includes(role)) {
      return res.status(403).json({ 
        message: 'Admin can only create teacher and student accounts' 
      });
    }

    // Validate required fields based on role
    if (role === 'teacher') {
      if (!phoneNumber) {
        return res.status(400).json({ 
          message: 'Phone number is required for teacher accounts' 
        });
      }
    }

    if (role === 'student') {
      if (!parentName || !parentCin || !parentPhoneNumber) {
        return res.status(400).json({ 
          message: 'Parent name, CIN, and phone number are required for student accounts' 
        });
      }
    }

    // Password validation for admin roles
    if (['admin', 'superadmin'].includes(role) && !password) {
      return res.status(400).json({ 
        message: 'Password is required for admin accounts' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }

    // Get school (if needed) - for superadmin/admin logic
    let schoolId = req.schoolId;

    // Create user object with role-specific fields
    const userData = {
      name,
      email,
      role,
      createdBy: creatorId,
      school: schoolId
    };

    // Add password only if provided
    if (password) {
      userData.password = password;
    }

    // Add role-specific fields
    if (role === 'teacher') {
      userData.phoneNumber = phoneNumber;
    }

    if (role === 'student') {
      userData.parentName = parentName;
      userData.parentCin = parentCin;
      userData.parentPhoneNumber = parentPhoneNumber;
    }

    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Response without password
    const userResponse = {
      id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      role: savedUser.role,
      ...(savedUser.role === 'teacher' && { phoneNumber: savedUser.phoneNumber }),
      ...(savedUser.role === 'student' && { 
        parentName: savedUser.parentName,
        parentCin: savedUser.parentCin,
        parentPhoneNumber: savedUser.parentPhoneNumber
      })
    };

    res.status(201).json({
      message: `${role} account created successfully`,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all users (filtered by role and requester's permissions)
const getAllUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 1000 } = req.query;
    const userRole = req.userRole;
    const schoolId = req.schoolId;
    
    let filter = { school: schoolId };

    if (userRole === 'superadmin') {
      // SuperAdmin → sees all roles in their school
      if (role) filter.role = role;

    } else if (userRole === 'admin') {
      // Admin → sees only teacher & student (not other admins/superadmins)
      filter.role = role ? role : { $in: ['teacher', 'student'] };

    } else if (userRole === 'teacher') {
      // Teacher → sees only students
      filter.role = 'student';
    }

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
    const { 
      name, 
      email, 
      phoneNumber, 
      parentName, 
      parentCin, 
      parentPhoneNumber 
    } = req.body;

    // Get the user to check their role
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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

    // Add role-specific updates
    if (user.role === 'teacher' && phoneNumber) {
      updates.phoneNumber = phoneNumber;
    }

    if (user.role === 'student') {
      if (parentName) updates.parentName = parentName;
      if (parentCin) updates.parentCin = parentCin;
      if (parentPhoneNumber) updates.parentPhoneNumber = parentPhoneNumber;
    }

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
    const userRole = req.userRole;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // SuperAdmin can delete admins, but prevent deleting the only admin unless there's another admin
    if (user.role === 'admin' && userRole === 'superadmin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount === 1) {
        return res.status(400).json({ 
          message: 'Cannot delete the only admin account' 
        });
      }
    }

    // Clean up class associations and related data based on user role
    if (user.role === 'teacher') {
      // Remove teacher from all classes they teach
      await Class.updateMany(
        { 'teacherSubjects.teacher': id },
        { $pull: { teacherSubjects: { teacher: id } } }
      );
      
      // Find all exercises created by this teacher
      const teacherExercises = await Exercise.find({ createdBy: id });
      const exerciseIds = teacherExercises.map(exercise => exercise._id);
      
      // Delete all student progress associated with these exercises
      const deletedProgress = await StudentProgress.deleteMany({ 
        exercise: { $in: exerciseIds } 
      });
      
      // Delete all exercises created by this teacher
      const deletedExercises = await Exercise.deleteMany({ createdBy: id });
      
      console.log(`Deleted ${deletedExercises.deletedCount} exercises and ${deletedProgress.deletedCount} student progress records for teacher ${user.name}`);
      
    } else if (user.role === 'student') {
      // Remove student from their class
      if (user.studentClass) {
        await Class.findByIdAndUpdate(
          user.studentClass,
          { $pull: { students: id } }
        );
      }
      
      // Delete all grades for this student
      const deletedGrades = await Grade.deleteMany({ student: id });
      
      // Delete all student progress records for this student
      const deletedProgress = await StudentProgress.deleteMany({ student: id });
      
      // ✅ NEW: Delete all payment records for this student
      const deletedPayments = await StudentPayment.deleteMany({ student: id });
      
      console.log(`Deleted ${deletedGrades.deletedCount} grades, ${deletedProgress.deletedCount} progress records, and ${deletedPayments.deletedCount} payment records for student ${user.name}`);
    }

    // Delete the user
    await User.findByIdAndDelete(id);

    res.status(200).json({ 
      message: 'User deleted successfully',
      ...(user.role === 'student' && { 
        gradesDeleted: true, 
        progressDeleted: true,
        paymentsDeleted: true 
      }),
      ...(user.role === 'teacher' && { 
        exercisesDeleted: true, 
        progressDeleted: true 
      })
    });
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

    // If user has a current password, verify it
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Set password for users who don't have one (teachers/students)
const setPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only allow setting password for teacher/student roles
    if (!['teacher', 'student'].includes(user.role)) {
      return res.status(403).json({ 
        message: 'Password setting is only allowed for teachers and students' 
      });
    }

    // Set password
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: 'Password set successfully' });
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
  setPassword,
  getProfile
};