// controllers/ouvrierFinancialController.js
const OuvrierFinancialInfo = require('../models/OuvrierFinancialInfo');
const OuvrierPaymentDossier = require('../models/OuvrierPaymentDossier');
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

// Helper function to generate 12 payment dossiers for academic year
const generatePaymentDossiers = async (ouvrierFinancialInfo, createdBy) => {
  const startDate = new Date(ouvrierFinancialInfo.startDate);
  const academicYear = getAcademicYear(startDate);
  const [startYear, endYear] = academicYear.split('-').map(Number);
  
  const dossiers = [];
  
  // Academic year months: Sept(9) to Aug(8)
  const academicMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
  
  for (const month of academicMonths) {
    // Determine the correct year for each month
    const year = month >= 9 ? startYear : endYear;
    
    // Calculate amount based on contract type
    let calculatedAmount = 0;
    if (ouvrierFinancialInfo.contractType === 'monthly') {
      calculatedAmount = ouvrierFinancialInfo.monthlySalary;
    } else if (ouvrierFinancialInfo.contractType === 'hourly') {
      calculatedAmount = ouvrierFinancialInfo.hourlyRate * ouvrierFinancialInfo.contractualHoursPerMonth;
    }
    
    const dossier = {
      ouvrier: ouvrierFinancialInfo.ouvrier,
      ouvrierFinancialInfo: ouvrierFinancialInfo._id,
      month,
      year,
      academicYear,
      hoursWorked: ouvrierFinancialInfo.contractType === 'hourly' ? ouvrierFinancialInfo.contractualHoursPerMonth : null,
      calculatedAmount,
      finalAmount: calculatedAmount,
      school: ouvrierFinancialInfo.school,
      createdBy
    };
    
    dossiers.push(dossier);
  }
  
  return dossiers;
};

// Create ouvrier financial info and generate payment dossiers
const createOuvrierFinancialInfo = async (req, res) => {
  try {
    const {
      ouvrierId,
      position,
      contractType,
      monthlySalary,
      hourlyRate,
      contractualHoursPerMonth,
      startDate
    } = req.body;
    
    const schoolId = req.schoolId;
    const createdBy = req.userId;
    
    // Validate ouvrier exists and is actually an ouvrier
    const ouvrier = await User.findOne({
      _id: ouvrierId,
      role: 'ouvrier',
      school: schoolId
    });
    
    if (!ouvrier) {
      return res.status(404).json({
        message: 'Ouvrier not found or invalid ouvrier ID'
      });
    }
    
    // Check if financial info already exists
    const existingInfo = await OuvrierFinancialInfo.findOne({
      ouvrier: ouvrierId
    });
    
    if (existingInfo) {
      return res.status(400).json({
        message: 'Financial information already exists for this ouvrier'
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
    
    // Create financial info
    const ouvrierFinancialInfo = new OuvrierFinancialInfo({
      ouvrier: ouvrierId,
      position,
      contractType,
      monthlySalary: contractType === 'monthly' ? monthlySalary : undefined,
      hourlyRate: contractType === 'hourly' ? hourlyRate : undefined,
      contractualHoursPerMonth: contractType === 'hourly' ? contractualHoursPerMonth : undefined,
      startDate: new Date(startDate),
      school: schoolId,
      createdBy
    });
    
    await ouvrierFinancialInfo.save();
    
    // Generate 12 payment dossiers for the academic year
    const dossiers = await generatePaymentDossiers(ouvrierFinancialInfo, createdBy);
    await OuvrierPaymentDossier.insertMany(dossiers);
    
    // Populate the saved document
    await ouvrierFinancialInfo.populate('ouvrier', 'name email');
    
    res.status(201).json({
      message: 'Ouvrier financial information created successfully',
      ouvrierFinancialInfo,
      dossiersCreated: dossiers.length
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all ouvriers with their financial info
const getAllOuvriersFinancial = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      position,
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
    
    if (position) {
      filter.position = position;
    }
    
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
          localField: 'ouvrier',
          foreignField: '_id',
          as: 'ouvrierInfo'
        }
      },
      { $unwind: '$ouvrierInfo' },
    ];
    
    // Add search filter if provided
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'ouvrierInfo.name': { $regex: search, $options: 'i' } },
            { 'ouvrierInfo.email': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }
    
    // Add sorting
    const sortOptions = {};
    if (sortBy === 'ouvrierName') {
      sortOptions['ouvrierInfo.name'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }
    pipeline.push({ $sort: sortOptions });
    
    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await OuvrierFinancialInfo.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    
    // Add pagination
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });
    
    // Execute aggregation
    const ouvriersFinancial = await OuvrierFinancialInfo.aggregate(pipeline);
    
    res.status(200).json({
      ouvriersFinancial,
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

// Get ouvrier financial info by ID
const getOuvrierFinancialInfo = async (req, res) => {
  try {
    const { ouvrierId } = req.params;
    const schoolId = req.schoolId;
    
    const ouvrierFinancialInfo = await OuvrierFinancialInfo.findOne({
      ouvrier: ouvrierId,
      school: schoolId
    }).populate('ouvrier', 'name email phoneNumber');
    
    if (!ouvrierFinancialInfo) {
      return res.status(404).json({
        message: 'Ouvrier financial information not found'
      });
    }
    
    res.status(200).json({ ouvrierFinancialInfo });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Update ouvrier financial info
const updateOuvrierFinancialInfo = async (req, res) => {
  try {
    const { ouvrierId } = req.params;
    const {
      position,
      contractType,
      monthlySalary,
      hourlyRate,
      contractualHoursPerMonth,
      isActive
    } = req.body;
    
    const schoolId = req.schoolId;
    
    const ouvrierFinancialInfo = await OuvrierFinancialInfo.findOne({
      ouvrier: ouvrierId,
      school: schoolId
    });
    
    if (!ouvrierFinancialInfo) {
      return res.status(404).json({
        message: 'Ouvrier financial information not found'
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
    
    // Update fields
    if (position) ouvrierFinancialInfo.position = position;
    if (contractType) ouvrierFinancialInfo.contractType = contractType;
    if (isActive !== undefined) ouvrierFinancialInfo.isActive = isActive;
    
    if (contractType === 'monthly') {
      ouvrierFinancialInfo.monthlySalary = monthlySalary;
      ouvrierFinancialInfo.hourlyRate = undefined;
      ouvrierFinancialInfo.contractualHoursPerMonth = undefined;
    } else if (contractType === 'hourly') {
      ouvrierFinancialInfo.hourlyRate = hourlyRate;
      ouvrierFinancialInfo.contractualHoursPerMonth = contractualHoursPerMonth;
      ouvrierFinancialInfo.monthlySalary = undefined;
    }
    
    await ouvrierFinancialInfo.save();
    await ouvrierFinancialInfo.populate('ouvrier', 'name email');
    
    res.status(200).json({
      message: 'Ouvrier financial information updated successfully',
      ouvrierFinancialInfo
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete ouvrier financial info and all related payment dossiers
const deleteOuvrierFinancialInfo = async (req, res) => {
  try {
    const { ouvrierId } = req.params;
    const schoolId = req.schoolId;
    
    const ouvrierFinancialInfo = await OuvrierFinancialInfo.findOne({
      ouvrier: ouvrierId,
      school: schoolId
    });
    
    if (!ouvrierFinancialInfo) {
      return res.status(404).json({
        message: 'Ouvrier financial information not found'
      });
    }
    
    // Delete all related payment dossiers
    const deletedDossiers = await OuvrierPaymentDossier.deleteMany({
      ouvrier: ouvrierId
    });
    
    // Delete financial info
    await OuvrierFinancialInfo.deleteOne({ _id: ouvrierFinancialInfo._id });
    
    res.status(200).json({
      message: 'Ouvrier financial information deleted successfully',
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
  createOuvrierFinancialInfo,
  getAllOuvriersFinancial,
  getOuvrierFinancialInfo,
  updateOuvrierFinancialInfo,
  deleteOuvrierFinancialInfo
};