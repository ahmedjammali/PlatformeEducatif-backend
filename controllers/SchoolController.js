// controllers/schoolController.js
const School = require('../models/School');
const User = require('../models/User');

// Create the school (SuperAdmin only - one time operation)
const createSchool = async (req, res) => {
  try {
    const { schoolName, adminName, adminEmail, adminPassword } = req.body;

    // Check if a school already exists
    const existingSchool = await School.findOne();
    if (existingSchool) {
      return res.status(400).json({ 
        message: 'A school already exists. Only one school is allowed.' 
      });
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'An account with this email already exists' 
      });
    }

    // First create the school without admin
    const school = new School({
      name: schoolName,
      admin: null // Temporarily null
    });

    const savedSchool = await school.save();

    // Update the superadmin user with school reference
    await User.findByIdAndUpdate(req.userId, { school: savedSchool._id });

    // Then create admin user with school reference
    const adminUser = new User({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      school: savedSchool._id,
      createdBy: req.userId
    });

    const savedAdmin = await adminUser.save();

    // Update school with admin reference
    savedSchool.admin = savedAdmin._id;
    await savedSchool.save();

    res.status(201).json({
      message: 'School created successfully',
      school: {
        id: savedSchool._id,
        name: savedSchool.name,
        isActive: savedSchool.isActive
      },
      admin: {
        id: savedAdmin._id,
        name: savedAdmin.name,
        email: savedAdmin.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get the school
const getSchool = async (req, res) => {
  try {
    const school = await School.findOne()
      .populate('admin', 'name email');

    if (!school) {
      return res.status(404).json({ message: 'No school found' });
    }

    // Get statistics
    const [totalTeachers, totalStudents, totalClasses] = await Promise.all([
      User.countDocuments({ school: school._id, role: 'teacher' }),
      User.countDocuments({ school: school._id, role: 'student' }),
      require('../models/Class').countDocuments({ school: school._id })
    ]);

    res.status(200).json({
      school: {
        id: school._id,
        name: school.name,
        isActive: school.isActive,
        admin: school.admin,
        createdAt: school.createdAt
      },
      statistics: {
        totalTeachers,
        totalStudents,
        totalClasses,
        totalUsers: totalTeachers + totalStudents + 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Block/Unblock school (SuperAdmin only)
const toggleSchoolAccess = async (req, res) => {
  try {
    const { block, reason } = req.body;

    const school = await School.findOne();
    if (!school) {
      return res.status(404).json({ message: 'No school found' });
    }

    school.isActive = !block;
    school.blockedReason = block ? (reason || 'No reason provided') : null;

    await school.save();

    res.status(200).json({
      message: `School ${block ? 'blocked' : 'unblocked'} successfully`,
      school: {
        id: school._id,
        name: school.name,
        isActive: school.isActive,
        blockedReason: school.blockedReason
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update school name (Admin or SuperAdmin only)
const updateSchoolName = async (req, res) => {
  try {
    const { name } = req.body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ 
        message: 'School name is required and must be a non-empty string' 
      });
    }

    // Check if name is too long (optional validation)
    if (name.trim().length > 100) {
      return res.status(400).json({ 
        message: 'School name cannot exceed 100 characters' 
      });
    }

    // Find the school
    const school = await School.findOne();
    if (!school) {
      return res.status(404).json({ message: 'No school found' });
    }

    // Check if school is active
    if (!school.isActive) {
      return res.status(403).json({ 
        message: 'Cannot update school name. School is currently blocked.' 
      });
    }

    // Store old name for response
    const oldName = school.name;

    // Update the school name
    school.name = name.trim();
    const updatedSchool = await school.save();

    res.status(200).json({
      message: 'School name updated successfully',
      school: {
        id: updatedSchool._id,
        name: updatedSchool.name,
        oldName: oldName,
        isActive: updatedSchool.isActive,
        updatedAt: updatedSchool.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createSchool,
  getSchool,
  toggleSchoolAccess,
  updateSchoolName
};