// controllers/ChargeController.js
const Charge = require('../models/Charge');
const mongoose = require('mongoose');

// Create a new charge
const createCharge = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subCategory,
      amount,
      currency,
      purchaseDate,
      supplier,
      paymentMethod,
      paymentStatus,
      priority,
      isRecurring,
      recurringSettings,
      budgetCategory,
      approvalRequired,
      taxInfo,
      notes,
      tags
    } = req.body;

    // Validate required fields
    if (!title || !category || !amount || !paymentMethod) {
      return res.status(400).json({
        message: 'Title, category, amount, and payment method are required'
      });
    }

    // Create charge object
    const chargeData = {
      title,
      description,
      category,
      subCategory,
      amount: parseFloat(amount),
      currency: currency || 'TND',
      purchaseDate: purchaseDate || new Date(),
      supplier,
      paymentMethod,
      paymentStatus: paymentStatus || 'pending',
      priority: priority || 'medium',
      isRecurring: isRecurring || false,
      budgetCategory,
      approvalRequired: approvalRequired || false,
      taxInfo: taxInfo || { taxRate: 0, taxAmount: 0 },
      notes,
      tags: tags || [],
      school: req.user.school,
      createdBy: req.user._id
    };

    // Add recurring settings if applicable
    if (isRecurring && recurringSettings) {
      chargeData.recurringSettings = {
        frequency: recurringSettings.frequency,
        nextDueDate: new Date(recurringSettings.nextDueDate),
        endDate: recurringSettings.endDate ? new Date(recurringSettings.endDate) : null,
        isActive: true
      };
    }

    const charge = new Charge(chargeData);
    await charge.save();

    // Populate references for response
    await charge.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' }
    ]);

    res.status(201).json({
      message: 'Charge created successfully',
      charge
    });

  } catch (error) {
    console.error('Error creating charge:', error);
    res.status(500).json({
      message: 'Failed to create charge',
      error: error.message
    });
  }
};

// Get all charges with advanced filtering and pagination
const getAllCharges = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      paymentStatus,
      priority,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      supplier,
      search,
      sortBy = 'purchaseDate',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { school: req.user.school };

    if (category) filter.category = category;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (priority) filter.priority = priority;
    if (supplier) filter['supplier.name'] = new RegExp(supplier, 'i');

    // Date range filter
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = new Date(startDate);
      if (endDate) filter.purchaseDate.$lte = new Date(endDate);
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }

    // Search in title, description, and notes
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { notes: new RegExp(search, 'i') },
        { 'supplier.name': new RegExp(search, 'i') }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const charges = await Charge.find(filter)
      .populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'approvedBy', select: 'name email' },
        { path: 'updatedBy', select: 'name email' }
      ])
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const totalCharges = await Charge.countDocuments(filter);

    // Calculate summary statistics
    const stats = await Charge.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          totalCharges: { $sum: 1 },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$amount', 0]
            }
          },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    res.json({
      charges,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCharges / limit),
        totalCharges,
        hasNextPage: page < Math.ceil(totalCharges / limit),
        hasPrevPage: page > 1
      },
      statistics: stats[0] || {
        totalAmount: 0,
        averageAmount: 0,
        totalCharges: 0,
        pendingAmount: 0,
        paidAmount: 0
      }
    });

  } catch (error) {
    console.error('Error getting charges:', error);
    res.status(500).json({
      message: 'Failed to retrieve charges',
      error: error.message
    });
  }
};

// Get charge by ID
const getChargeById = async (req, res) => {
  try {
    const { id } = req.params;

    const charge = await Charge.findOne({
      _id: id,
      school: req.user.school
    }).populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'approvedBy', select: 'name email role' },
      { path: 'updatedBy', select: 'name email role' }
    ]);

    if (!charge) {
      return res.status(404).json({
        message: 'Charge not found'
      });
    }

    res.json({ charge });

  } catch (error) {
    console.error('Error getting charge:', error);
    res.status(500).json({
      message: 'Failed to retrieve charge',
      error: error.message
    });
  }
};

// Update charge
const updateCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Add updatedBy field
    updateData.updatedBy = req.user._id;

    // Handle approval
    if (updateData.paymentStatus === 'paid' && !updateData.approvedBy) {
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
    }

    const charge = await Charge.findOneAndUpdate(
      { _id: id, school: req.user.school },
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    if (!charge) {
      return res.status(404).json({
        message: 'Charge not found'
      });
    }

    res.json({
      message: 'Charge updated successfully',
      charge
    });

  } catch (error) {
    console.error('Error updating charge:', error);
    res.status(500).json({
      message: 'Failed to update charge',
      error: error.message
    });
  }
};

// Delete charge
const deleteCharge = async (req, res) => {
  try {
    const { id } = req.params;

    const charge = await Charge.findOneAndDelete({
      _id: id,
      school: req.user.school
    });

    if (!charge) {
      return res.status(404).json({
        message: 'Charge not found'
      });
    }

    res.json({
      message: 'Charge deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting charge:', error);
    res.status(500).json({
      message: 'Failed to delete charge',
      error: error.message
    });
  }
};

// Get charge analytics/dashboard data
const getChargeAnalytics = async (req, res) => {
  try {
    const { timeframe = 'monthly', year = new Date().getFullYear() } = req.query;
    
    const schoolFilter = { school: req.user.school };

    // Monthly analytics for the current year
    const monthlyStats = await Charge.aggregate([
      {
        $match: {
          ...schoolFilter,
          purchaseDate: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { month: { $month: '$purchaseDate' } },
          totalAmount: { $sum: '$amount' },
          totalCharges: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Category breakdown
    const categoryStats = await Charge.aggregate([
      { $match: schoolFilter },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          totalCharges: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Payment status breakdown
    const paymentStatusStats = await Charge.aggregate([
      { $match: schoolFilter },
      {
        $group: {
          _id: '$paymentStatus',
          totalAmount: { $sum: '$amount' },
          totalCharges: { $sum: 1 }
        }
      }
    ]);

    // Recent charges (last 10)
    const recentCharges = await Charge.find(schoolFilter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title amount category paymentStatus purchaseDate createdBy');

    // Upcoming recurring charges
    const upcomingRecurring = await Charge.find({
      ...schoolFilter,
      isRecurring: true,
      'recurringSettings.isActive': true,
      'recurringSettings.nextDueDate': {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
      }
    }).sort({ 'recurringSettings.nextDueDate': 1 });

    res.json({
      monthlyStats,
      categoryStats,
      paymentStatusStats,
      recentCharges,
      upcomingRecurring
    });

  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      message: 'Failed to retrieve analytics',
      error: error.message
    });
  }
};

// Get subcategories for a category
const getSubcategories = async (req, res) => {
  try {
    const { category } = req.params;
    const subcategories = Charge.getSubcategories(category);
    
    res.json({ subcategories });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to get subcategories',
      error: error.message
    });
  }
};

// Bulk operations
const bulkUpdateCharges = async (req, res) => {
  try {
    const { chargeIds, updateData } = req.body;

    if (!chargeIds || !Array.isArray(chargeIds) || chargeIds.length === 0) {
      return res.status(400).json({
        message: 'Charge IDs array is required'
      });
    }

    const result = await Charge.updateMany(
      {
        _id: { $in: chargeIds },
        school: req.user.school
      },
      {
        ...updateData,
        updatedBy: req.user._id
      }
    );

    res.json({
      message: 'Charges updated successfully',
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error bulk updating charges:', error);
    res.status(500).json({
      message: 'Failed to update charges',
      error: error.message
    });
  }
};

module.exports = {
  createCharge,
  getAllCharges,
  getChargeById,
  updateCharge,
  deleteCharge,
  getChargeAnalytics,
  getSubcategories,
  bulkUpdateCharges
};