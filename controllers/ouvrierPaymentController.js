// controllers/ouvrierPaymentController.js
const OuvrierPaymentDossier = require('../models/OuvrierPaymentDossier');
const OuvrierFinancialInfo = require('../models/OuvrierFinancialInfo');

// Get all payment dossiers with filters
const getAllPaymentDossiers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      ouvrierId,
      position,
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
    
    if (ouvrierId) filter.ouvrier = ouvrierId;
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
          localField: 'ouvrier',
          foreignField: '_id',
          as: 'ouvrierInfo'
        }
      },
      { $unwind: '$ouvrierInfo' },
      {
        $lookup: {
          from: 'ouvrierfinancialinfos',
          localField: 'ouvrierFinancialInfo',
          foreignField: '_id',
          as: 'financialInfo'
        }
      },
      { $unwind: '$financialInfo' }
    ];
    
    // Add position filter if provided
    if (position) {
      pipeline.push({
        $match: {
          'financialInfo.position': position
        }
      });
    }
    
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
    const countResult = await OuvrierPaymentDossier.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    
    // Add pagination
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });
    
    // Execute aggregation
    const paymentDossiers = await OuvrierPaymentDossier.aggregate(pipeline);
    
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

// Get payment dossiers for specific ouvrier
const getOuvrierPaymentDossiers = async (req, res) => {
  try {
    const { ouvrierId } = req.params;
    const { academicYear, status } = req.query;
    const schoolId = req.schoolId;
    
    let filter = {
      ouvrier: ouvrierId,
      school: schoolId
    };
    
    if (academicYear) filter.academicYear = academicYear;
    if (status) filter.status = status;
    
    const paymentDossiers = await OuvrierPaymentDossier.find(filter)
      .populate('ouvrier', 'name email')
      .populate('ouvrierFinancialInfo', 'position contractType monthlySalary hourlyRate')
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
    
    const paymentDossier = await OuvrierPaymentDossier.findOne({
      _id: dossierId,
      school: schoolId
    })
      .populate('ouvrier', 'name email phoneNumber')
      .populate('ouvrierFinancialInfo')
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
    
    const paymentDossier = await OuvrierPaymentDossier.findOne({
      _id: dossierId,
      school: schoolId
    }).populate('ouvrierFinancialInfo');
    
    if (!paymentDossier) {
      return res.status(404).json({
        message: 'Payment dossier not found'
      });
    }
    
    // Update hours worked and recalculate if needed
    if (hoursWorked !== undefined) {
      paymentDossier.hoursWorked = hoursWorked;
      
      // Recalculate amount for hourly contracts
      if (paymentDossier.ouvrierFinancialInfo.contractType === 'hourly') {
        paymentDossier.calculatedAmount = hoursWorked * paymentDossier.ouvrierFinancialInfo.hourlyRate;
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
    await paymentDossier.populate('ouvrier', 'name email');
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
    
    const result = await OuvrierPaymentDossier.updateMany(
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
    const { academicYear, position, month, year } = req.query;
    const schoolId = req.schoolId;
    
    let matchFilter = { school: schoolId };
    if (academicYear) matchFilter.academicYear = academicYear;
    if (month) matchFilter.month = parseInt(month);
    if (year) matchFilter.year = parseInt(year);
    
    // Build aggregation pipeline
    const pipeline = [
      { $match: matchFilter }
    ];
    
    // Add position filter if provided
    if (position) {
      pipeline.push(
        {
          $lookup: {
            from: 'ouvrierfinancialinfos',
            localField: 'ouvrierFinancialInfo',
            foreignField: '_id',
            as: 'financialInfo'
          }
        },
        { $unwind: '$financialInfo' },
        { $match: { 'financialInfo.position': position } }
      );
    }
    
    // Add statistics aggregation
    pipeline.push({
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
    });
    
    const statistics = await OuvrierPaymentDossier.aggregate(pipeline);
    
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
  getOuvrierPaymentDossiers,
  getPaymentDossier,
  updatePaymentDossier,
  bulkUpdatePaymentDossiers,
  getPaymentStatistics
};