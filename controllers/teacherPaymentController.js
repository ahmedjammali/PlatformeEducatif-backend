// controllers/teacherPaymentController.js
const TeacherPaymentDossier = require('../models/TeacherPaymentDossier');
const TeacherFinancialInfo = require('../models/TeacherFinancialInfo');

// Get all payment dossiers with filters
const getAllPaymentDossiers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      teacherId,
      month,
      year,
      academicYear,
      status,
      search,
      sortBy = 'month',
      sortOrder = 'asc'
    } = req.query;
    
    const schoolId = req.schoolId;
    const skip = (page - 1) * limit;
    
    // Build filter
    let filter = { school: schoolId };
    
    if (teacherId) filter.teacher = teacherId;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (academicYear) filter.academicYear = academicYear;
    if (status) filter.status = status;
    
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
        $lookup: {
          from: 'teacherfinancialinfos',
          localField: 'teacherFinancialInfo',
          foreignField: '_id',
          as: 'financialInfo'
        }
      },
      { $unwind: '$financialInfo' }
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
    } else if (sortBy === 'academicOrder') {
      // Custom sort for academic year order (Sept to Aug)
      pipeline.push({
        $addFields: {
          academicOrder: {
            $cond: {
              if: { $gte: ['$month', 9] },
              then: { $subtract: ['$month', 8] }, // Sept=1, Oct=2, Nov=3, Dec=4
              else: { $add: ['$month', 4] } // Jan=5, Feb=6... Aug=12
            }
          }
        }
      });
      sortOptions['academicOrder'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }
    pipeline.push({ $sort: sortOptions });
    
    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await TeacherPaymentDossier.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    
    // Add pagination
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });
    
    // Execute aggregation
    const paymentDossiers = await TeacherPaymentDossier.aggregate(pipeline);
    
    res.status(200).json({
      paymentDossiers,
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

// Get payment dossiers for specific teacher
const getTeacherPaymentDossiers = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYear, status } = req.query;
    const schoolId = req.schoolId;
    
    let filter = {
      teacher: teacherId,
      school: schoolId
    };
    
    if (academicYear) filter.academicYear = academicYear;
    if (status) filter.status = status;
    
    const paymentDossiers = await TeacherPaymentDossier.find(filter)
      .populate('teacher', 'name email')
      .populate('teacherFinancialInfo', 'contractType monthlySalary hourlyRate')
      .sort({ 
        year: 1,
        month: 1
      });
    
    // Sort by academic year order
    const sortedDossiers = paymentDossiers.sort((a, b) => {
      const getAcademicOrder = (month) => {
        return month >= 9 ? month - 8 : month + 4;
      };
      return getAcademicOrder(a.month) - getAcademicOrder(b.month);
    });
    
    res.status(200).json({ paymentDossiers: sortedDossiers });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get specific payment dossier
const getPaymentDossier = async (req, res) => {
  try {
    const { dossierId } = req.params;
    const schoolId = req.schoolId;
    
    const paymentDossier = await TeacherPaymentDossier.findOne({
      _id: dossierId,
      school: schoolId
    })
      .populate('teacher', 'name email phoneNumber')
      .populate('teacherFinancialInfo')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    
    if (!paymentDossier) {
      return res.status(404).json({
        message: 'Payment dossier not found'
      });
    }
    
    res.status(200).json({ paymentDossier });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Update payment dossier (hours worked, final amount, status, etc.)
const updatePaymentDossier = async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      hoursWorked,
      finalAmount,
      status,
      paymentDate,
      notes
    } = req.body;
    
    const schoolId = req.schoolId;
    const updatedBy = req.userId;
    
    const paymentDossier = await TeacherPaymentDossier.findOne({
      _id: dossierId,
      school: schoolId
    }).populate('teacherFinancialInfo');
    
    if (!paymentDossier) {
      return res.status(404).json({
        message: 'Payment dossier not found'
      });
    }
    
    // Update hours worked and recalculate if needed
    if (hoursWorked !== undefined) {
      paymentDossier.hoursWorked = hoursWorked;
      
      // Recalculate amount for hourly contracts
      if (paymentDossier.teacherFinancialInfo.contractType === 'hourly') {
        paymentDossier.calculatedAmount = hoursWorked * paymentDossier.teacherFinancialInfo.hourlyRate;
        // Update final amount to calculated amount if not manually overridden
        if (!finalAmount) {
          paymentDossier.finalAmount = paymentDossier.calculatedAmount;
        }
      }
    }
    
    // Update other fields
    if (finalAmount !== undefined) paymentDossier.finalAmount = finalAmount;
    if (status) paymentDossier.status = status;
    if (notes !== undefined) paymentDossier.notes = notes;
    if (paymentDate) paymentDossier.paymentDate = new Date(paymentDate);
    
    // Set payment date automatically if marking as paid
    if (status === 'paid' && !paymentDate) {
      paymentDossier.paymentDate = new Date();
    }
    
    // Clear payment date if marking as unpaid
    if (status === 'unpaid') {
      paymentDossier.paymentDate = null;
    }
    
    paymentDossier.updatedBy = updatedBy;
    await paymentDossier.save();
    
    // Populate for response
    await paymentDossier.populate('teacher', 'name email');
    await paymentDossier.populate('updatedBy', 'name');
    
    res.status(200).json({
      message: 'Payment dossier updated successfully',
      paymentDossier
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Bulk update multiple payment dossiers
const bulkUpdatePaymentDossiers = async (req, res) => {
  try {
    const { dossierIds, updates } = req.body;
    const schoolId = req.schoolId;
    const updatedBy = req.userId;
    
    if (!dossierIds || !Array.isArray(dossierIds) || dossierIds.length === 0) {
      return res.status(400).json({
        message: 'Dossier IDs array is required'
      });
    }
    
    const updateData = { ...updates, updatedBy, updatedAt: new Date() };
    
    // Set payment date automatically if marking as paid
    if (updates.status === 'paid' && !updates.paymentDate) {
      updateData.paymentDate = new Date();
    }
    
    // Clear payment date if marking as unpaid
    if (updates.status === 'unpaid') {
      updateData.paymentDate = null;
    }
    
    const result = await TeacherPaymentDossier.updateMany(
      {
        _id: { $in: dossierIds },
        school: schoolId
      },
      { $set: updateData }
    );
    
    res.status(200).json({
      message: `${result.modifiedCount} payment dossiers updated successfully`,
      modifiedCount: result.modifiedCount
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get payment statistics
const getPaymentStatistics = async (req, res) => {
  try {
    const { academicYear, month, year } = req.query;
    const schoolId = req.schoolId;
    
    let matchFilter = { school: schoolId };
    if (academicYear) matchFilter.academicYear = academicYear;
    if (month) matchFilter.month = parseInt(month);
    if (year) matchFilter.year = parseInt(year);
    
    const statistics = await TeacherPaymentDossier.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalDossiers: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$finalAmount', 0]
            }
          },
          unpaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'unpaid'] }, '$finalAmount', 0]
            }
          },
          partialAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'partial'] }, '$finalAmount', 0]
            }
          },
          paidCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
            }
          },
          unpaidCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0]
            }
          },
          partialCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'partial'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    const stats = statistics[0] || {
      totalDossiers: 0,
      totalAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0,
      partialAmount: 0,
      paidCount: 0,
      unpaidCount: 0,
      partialCount: 0
    };
    
    res.status(200).json({ statistics: stats });
    
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  getAllPaymentDossiers,
  getTeacherPaymentDossiers,
  getPaymentDossier,
  updatePaymentDossier,
  bulkUpdatePaymentDossiers,
  getPaymentStatistics
};