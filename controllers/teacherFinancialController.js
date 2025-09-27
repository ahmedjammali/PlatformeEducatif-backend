// controllers/teacherFinancialController.js
const TeacherFinancialInfo = require('../models/TeacherFinancialInfo');
const TeacherPaymentDossier = require('../models/TeacherPaymentDossier');
const User = require('../models/User');

// Helper function to get academic year from date
const getAcademicYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  
  if (month >= 9) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};

// Helper function to generate payment dossiers for selected months
const generatePaymentDossiers = async (teacherFinancialInfo, createdBy) => {
  const startDate = new Date(teacherFinancialInfo.startDate);
  const endDate = new Date(teacherFinancialInfo.endDate);
  const academicYear = getAcademicYear(startDate);
  const [startYear, endYear] = academicYear.split('-').map(Number);
  
  const dossiers = [];
  
  // Only create dossiers for the selected contract months
  for (const month of teacherFinancialInfo.contractMonths) {
    // Determine the correct year for each month based on academic year
    const year = month >= 9 ? startYear : endYear;
    
    // Create a date for this month to check if it's within contract period
    const monthDate = new Date(year, month - 1, 1);
    
    // Skip if this month is outside the contract period
    if (monthDate < startDate || monthDate > endDate) {
      continue;
    }
    
    // Calculate amount based on contract type
    let calculatedAmount = 0;
    if (teacherFinancialInfo.contractType === 'monthly') {
      calculatedAmount = teacherFinancialInfo.monthlySalary;
    } else if (teacherFinancialInfo.contractType === 'hourly') {
      calculatedAmount = teacherFinancialInfo.hourlyRate * teacherFinancialInfo.contractualHoursPerMonth;
    }
    
    const dossier = {
      teacher: teacherFinancialInfo.teacher,
      teacherFinancialInfo: teacherFinancialInfo._id,
      month,
      year,
      academicYear,
      hoursWorked: teacherFinancialInfo.contractType === 'hourly' ? teacherFinancialInfo.contractualHoursPerMonth : null,
      calculatedAmount,
      finalAmount: calculatedAmount,
      school: teacherFinancialInfo.school,
      createdBy
    };
    
    dossiers.push(dossier);
  }
  
  return dossiers;
};

// Create teacher financial info and generate payment dossiers
const createTeacherFinancialInfo = async (req, res) => {
  try {
    const {
      teacherId,
      contractType,
      monthlySalary,
      hourlyRate,
      contractualHoursPerMonth,
      startDate,
      endDate,
      contractMonths
    } = req.body;
    
    const schoolId = req.schoolId;
    const createdBy = req.userId;
    
    // Validate teacher exists and is actually a teacher
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      school: schoolId
    });
    
    if (!teacher) {
      return res.status(404).json({
        message: 'Teacher not found or invalid teacher ID'
      });
    }
    
    // Check if financial info already exists
    const existingInfo = await TeacherFinancialInfo.findOne({
      teacher: teacherId
    });
    
    if (existingInfo) {
      return res.status(400).json({
        message: 'Financial information already exists for this teacher'
      });
    }
    
    // Validate contract type specific fields
    if (contractType === 'monthly' && !monthlySalary) {
      return res.status(400).json({
        message: 'Monthly salary is required for monthly contract'
      });
    }
    
    if (contractType === 'hourly' && (!hourlyRate || !contractualHoursPerMonth)) {
      return res.status(400).json({
        message: 'Hourly rate and contractual hours per month are required for hourly contract'
      });
    }
    
    // Validate contract months
    if (!contractMonths || !Array.isArray(contractMonths) || contractMonths.length === 0) {
      return res.status(400).json({
        message: 'Contract months array is required and cannot be empty'
      });
    }
    
    // Validate that all months are valid (1-12)
    const invalidMonths = contractMonths.filter(month => month < 1 || month > 12);
    if (invalidMonths.length > 0) {
      return res.status(400).json({
        message: 'All contract months must be between 1 and 12'
      });
    }
    
    // Remove duplicates and sort
    const uniqueMonths = [...new Set(contractMonths)].sort((a, b) => a - b);
    
    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return res.status(400).json({
        message: 'End date must be after start date'
      });
    }
    
    // Create financial info
    const teacherFinancialInfo = new TeacherFinancialInfo({
      teacher: teacherId,
      contractType,
      monthlySalary: contractType === 'monthly' ? monthlySalary : undefined,
      hourlyRate: contractType === 'hourly' ? hourlyRate : undefined,
      contractualHoursPerMonth: contractType === 'hourly' ? contractualHoursPerMonth : undefined,
      startDate: start,
      endDate: end,
      contractMonths: uniqueMonths,
      school: schoolId,
      createdBy
    });
    
    await teacherFinancialInfo.save();
    
    // Generate payment dossiers for the selected months
    const dossiers = await generatePaymentDossiers(teacherFinancialInfo, createdBy);
    
    if (dossiers.length > 0) {
      await TeacherPaymentDossier.insertMany(dossiers);
    }
    
    // Populate the saved document
    await teacherFinancialInfo.populate('teacher', 'name email');
    
    res.status(201).json({
      message: 'Teacher financial information created successfully',
      teacherFinancialInfo,
      dossiersCreated: dossiers.length,
      contractDuration: `${dossiers.length} months`
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all teachers with their financial info
const getAllTeachersFinancial = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      contractType,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const schoolId = req.schoolId;
    const skip = (page - 1) * limit;
    
    // Build filter
    let filter = { school: schoolId };
    
    if (contractType) {
      filter.contractType = contractType;
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Build aggregation pipeline
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'teacher',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      { $unwind: '$teacherInfo' },
      {
        $addFields: {
          contractDuration: { $size: '$contractMonths' }
        }
      }
    ];
    
    // Add search filter if provided
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'teacherInfo.name': { $regex: search, $options: 'i' } },
            { 'teacherInfo.email': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }
    
    // Add sorting
    const sortOptions = {};
    if (sortBy === 'teacherName') {
      sortOptions['teacherInfo.name'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }
    pipeline.push({ $sort: sortOptions });
    
    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await TeacherFinancialInfo.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    
    // Add pagination
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });
    
    // Execute aggregation
    const teachersFinancial = await TeacherFinancialInfo.aggregate(pipeline);
    
    res.status(200).json({
      teachersFinancial,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get teacher financial info by ID
const getTeacherFinancialInfo = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const schoolId = req.schoolId;
    
    const teacherFinancialInfo = await TeacherFinancialInfo.findOne({
      teacher: teacherId,
      school: schoolId
    }).populate('teacher', 'name email phoneNumber');
    
    if (!teacherFinancialInfo) {
      return res.status(404).json({
        message: 'Teacher financial information not found'
      });
    }
    
    // Add helpful information about the contract
    const contractInfo = {
      ...teacherFinancialInfo.toObject(),
      contractDuration: teacherFinancialInfo.getContractDuration(),
      monthNames: teacherFinancialInfo.contractMonths.map(month => {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return monthNames[month - 1];
      })
    };
    
    res.status(200).json({ teacherFinancialInfo: contractInfo });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Update teacher financial info
const updateTeacherFinancialInfo = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const {
      contractType,
      monthlySalary,
      hourlyRate,
      contractualHoursPerMonth,
      endDate,
      contractMonths,
      isActive
    } = req.body;
    
    const schoolId = req.schoolId;
    
    const teacherFinancialInfo = await TeacherFinancialInfo.findOne({
      teacher: teacherId,
      school: schoolId
    });
    
    if (!teacherFinancialInfo) {
      return res.status(404).json({
        message: 'Teacher financial information not found'
      });
    }
    
    // Validate contract type specific fields
    if (contractType === 'monthly' && !monthlySalary) {
      return res.status(400).json({
        message: 'Monthly salary is required for monthly contract'
      });
    }
    
    if (contractType === 'hourly' && (!hourlyRate || !contractualHoursPerMonth)) {
      return res.status(400).json({
        message: 'Hourly rate and contractual hours per month are required for hourly contract'
      });
    }
    
    // Validate contract months if provided
    if (contractMonths) {
      if (!Array.isArray(contractMonths) || contractMonths.length === 0) {
        return res.status(400).json({
          message: 'Contract months must be a non-empty array'
        });
      }
      
      const invalidMonths = contractMonths.filter(month => month < 1 || month > 12);
      if (invalidMonths.length > 0) {
        return res.status(400).json({
          message: 'All contract months must be between 1 and 12'
        });
      }
    }
    
    // Update fields
    if (contractType) teacherFinancialInfo.contractType = contractType;
    if (endDate) teacherFinancialInfo.endDate = new Date(endDate);
    if (contractMonths) teacherFinancialInfo.contractMonths = [...new Set(contractMonths)].sort((a, b) => a - b);
    if (isActive !== undefined) teacherFinancialInfo.isActive = isActive;
    
    if (contractType === 'monthly') {
      teacherFinancialInfo.monthlySalary = monthlySalary;
      teacherFinancialInfo.hourlyRate = undefined;
      teacherFinancialInfo.contractualHoursPerMonth = undefined;
    } else if (contractType === 'hourly') {
      teacherFinancialInfo.hourlyRate = hourlyRate;
      teacherFinancialInfo.contractualHoursPerMonth = contractualHoursPerMonth;
      teacherFinancialInfo.monthlySalary = undefined;
    }
    
    await teacherFinancialInfo.save();
    await teacherFinancialInfo.populate('teacher', 'name email');
    
    res.status(200).json({
      message: 'Teacher financial information updated successfully',
      teacherFinancialInfo
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete teacher financial info and all related payment dossiers
const deleteTeacherFinancialInfo = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const schoolId = req.schoolId;
    
    const teacherFinancialInfo = await TeacherFinancialInfo.findOne({
      teacher: teacherId,
      school: schoolId
    });
    
    if (!teacherFinancialInfo) {
      return res.status(404).json({
        message: 'Teacher financial information not found'
      });
    }
    
    // Delete all related payment dossiers
    const deletedDossiers = await TeacherPaymentDossier.deleteMany({
      teacher: teacherId
    });
    
    // Delete financial info
    await TeacherFinancialInfo.deleteOne({ _id: teacherFinancialInfo._id });
    
    res.status(200).json({
      message: 'Teacher financial information deleted successfully',
      dossiersDeleted: deletedDossiers.deletedCount
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  createTeacherFinancialInfo,
  getAllTeachersFinancial,
  getTeacherFinancialInfo,
  updateTeacherFinancialInfo,
  deleteTeacherFinancialInfo
};