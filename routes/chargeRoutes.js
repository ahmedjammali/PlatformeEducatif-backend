// routes/chargeRoutes.js
const express = require('express');
const router = express.Router();

const {
  createCharge,
  getAllCharges,
  getChargeById,
  updateCharge,
  deleteCharge,
  getChargeAnalytics,
  getSubcategories,
  bulkUpdateCharges
} = require('../controllers/ChargeController');

const {
  authenticate,
  isAdminOrHigher,
  isSuperAdminOrAdmin
} = require('../middleware/auth');

// Validation middleware for charge creation
const validateChargeCreation = (req, res, next) => {
  const { title, category, amount, paymentMethod } = req.body;
  
  if (!title || !category || !amount || !paymentMethod) {
    return res.status(400).json({ 
      message: 'Title, category, amount, and payment method are required' 
    });
  }

  // Validate amount
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      message: 'Amount must be a positive number'
    });
  }

  // Validate category
  const validCategories = [
    'utilities', 'equipment', 'maintenance', 'transportation', 
    'supplies', 'services', 'technology', 'infrastructure', 
    'events', 'emergency', 'other'
  ];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
    });
  }

  // Validate payment method
  const validPaymentMethods = ['cash', 'check', 'bank_transfer', 'credit_card', 'installments'];
  if (!validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      message: 'Invalid payment method. Must be one of: ' + validPaymentMethods.join(', ')
    });
  }

  // Validate recurring settings if provided
  const { isRecurring, recurringSettings } = req.body;
  if (isRecurring && recurringSettings) {
    const { frequency, nextDueDate } = recurringSettings;
    
    if (!frequency || !nextDueDate) {
      return res.status(400).json({
        message: 'Frequency and next due date are required for recurring charges'
      });
    }

    const validFrequencies = ['monthly', 'quarterly', 'annually'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        message: 'Invalid frequency. Must be one of: ' + validFrequencies.join(', ')
      });
    }

    // Validate date format
    const dueDate = new Date(nextDueDate);
    if (isNaN(dueDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid next due date format'
      });
    }
  }

  next();
};

const validateChargeUpdate = (req, res, next) => {
  const { amount, category, paymentMethod } = req.body;
  
  // Validate amount if provided
  if (amount !== undefined) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: 'Amount must be a positive number'
      });
    }
  }

  // Validate category if provided
  if (category !== undefined) {
    const validCategories = [
      'utilities', 'equipment', 'maintenance', 'transportation', 
      'supplies', 'services', 'technology', 'infrastructure', 
      'events', 'emergency', 'other'
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
      });
    }
  }

  // Validate payment method if provided
  if (paymentMethod !== undefined) {
    const validPaymentMethods = ['cash', 'check', 'bank_transfer', 'credit_card', 'installments'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        message: 'Invalid payment method. Must be one of: ' + validPaymentMethods.join(', ')
      });
    }
  }

  next();
};

const validateBulkUpdate = (req, res, next) => {
  const { chargeIds, updateData } = req.body;
  
  if (!chargeIds || !Array.isArray(chargeIds) || chargeIds.length === 0) {
    return res.status(400).json({
      message: 'Charge IDs array is required and must not be empty'
    });
  }

  if (chargeIds.length > 100) {
    return res.status(400).json({
      message: 'Cannot update more than 100 charges at once'
    });
  }

  if (!updateData || typeof updateData !== 'object') {
    return res.status(400).json({
      message: 'Update data is required'
    });
  }

  next();
};

const validateAnalyticsQuery = (req, res, next) => {
  const { year, timeframe } = req.query;
  
  if (year) {
    const parsedYear = parseInt(year);
    const currentYear = new Date().getFullYear();
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear + 1) {
      return res.status(400).json({
        message: 'Invalid year. Must be between 2000 and ' + (currentYear + 1)
      });
    }
  }

  if (timeframe) {
    const validTimeframes = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        message: 'Invalid timeframe. Must be one of: ' + validTimeframes.join(', ')
      });
    }
  }

  next();
};

// All routes require authentication
router.use(authenticate);

// =================== PUBLIC ROUTES (All authenticated users) ===================

// Get subcategories for a category
router.get('/subcategories/:category', getSubcategories);

// =================== ADMIN ONLY ROUTES ===================

// Analytics and dashboard data
router.get('/analytics', isAdminOrHigher, validateAnalyticsQuery, getChargeAnalytics);

// CRUD operations
router.post('/', isAdminOrHigher, validateChargeCreation, createCharge);
router.get('/', isAdminOrHigher, getAllCharges);
router.get('/:id', isAdminOrHigher, getChargeById);
router.put('/:id', isAdminOrHigher, validateChargeUpdate, updateCharge);
router.delete('/:id', isAdminOrHigher, deleteCharge);

// Bulk operations
router.put('/bulk/update', isAdminOrHigher, validateBulkUpdate, bulkUpdateCharges);

// =================== ADVANCED FEATURES ===================

// Export charges (could be implemented later)
router.get('/export/:format', isAdminOrHigher, (req, res) => {
  // Placeholder for export functionality (PDF, Excel, CSV)
  res.status(501).json({
    message: 'Export functionality coming soon',
    supportedFormats: ['pdf', 'excel', 'csv']
  });
});

// Import charges (could be implemented later)
router.post('/import', isAdminOrHigher, (req, res) => {
  // Placeholder for import functionality
  res.status(501).json({
    message: 'Import functionality coming soon',
    supportedFormats: ['excel', 'csv']
  });
});

// Charge templates (for commonly used charges)
router.get('/templates', isAdminOrHigher, (req, res) => {
  // Placeholder for charge templates
  const templates = [
    {
      name: 'Monthly Electricity Bill',
      category: 'utilities',
      subCategory: 'Electricity',
      isRecurring: true,
      recurringSettings: { frequency: 'monthly' },
      priority: 'high'
    },
    {
      name: 'Office Supplies',
      category: 'supplies',
      subCategory: 'Office Supplies',
      priority: 'medium'
    },
    {
      name: 'Computer Equipment',
      category: 'equipment',
      subCategory: 'Computers',
      priority: 'medium'
    }
  ];
  
  res.json({
    message: 'Charge templates retrieved successfully',
    templates
  });
});

// Approve multiple charges at once
router.put('/bulk/approve', isAdminOrHigher, validateBulkUpdate, async (req, res) => {
  try {
    const { chargeIds } = req.body;
    
    const result = await require('../models/Charge').updateMany(
      {
        _id: { $in: chargeIds },
        school: req.user.school,
        paymentStatus: { $in: ['pending', 'partially_paid'] }
      },
      {
        paymentStatus: 'paid',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        updatedBy: req.user._id
      }
    );

    res.json({
      message: 'Charges approved successfully',
      approvedCount: result.modifiedCount
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to approve charges',
      error: error.message
    });
  }
});

// Get charges summary by date range
router.get('/summary/daterange', isAdminOrHigher, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Start date and end date are required'
      });
    }

    const Charge = require('../models/Charge');
    
    const summary = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalCharges: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' },
          pendingCharges: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
          },
          paidCharges: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
          },
          overdueCharges: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$amount', 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] }
          }
        }
      }
    ]);

    const categoryBreakdown = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      summary: summary[0] || {
        totalCharges: 0,
        totalAmount: 0,
        averageAmount: 0,
        maxAmount: 0,
        minAmount: 0,
        pendingCharges: 0,
        paidCharges: 0,
        overdueCharges: 0,
        pendingAmount: 0,
        paidAmount: 0
      },
      categoryBreakdown,
      dateRange: { startDate, endDate }
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get charges summary',
      error: error.message
    });
  }
});

// Get top suppliers by spending
router.get('/suppliers/top', isAdminOrHigher, async (req, res) => {
  try {
    const { limit = 10, timeframe = 'all' } = req.query;
    const Charge = require('../models/Charge');
    
    let dateFilter = {};
    if (timeframe !== 'all') {
      const now = new Date();
      switch (timeframe) {
        case 'month':
          dateFilter = {
            purchaseDate: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1)
            }
          };
          break;
        case 'quarter':
          const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          dateFilter = { purchaseDate: { $gte: quarterStart } };
          break;
        case 'year':
          dateFilter = {
            purchaseDate: {
              $gte: new Date(now.getFullYear(), 0, 1)
            }
          };
          break;
      }
    }

    const topSuppliers = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          'supplier.name': { $exists: true, $ne: '' },
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$supplier.name',
          totalSpent: { $sum: '$amount' },
          orderCount: { $sum: 1 },
          averageOrder: { $avg: '$amount' },
          lastOrder: { $max: '$purchaseDate' },
          supplierInfo: { $first: '$supplier' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      topSuppliers,
      timeframe,
      totalSuppliers: topSuppliers.length
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get top suppliers',
      error: error.message
    });
  }
});

// Get upcoming payments (due soon)
router.get('/upcoming/payments', isAdminOrHigher, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const Charge = require('../models/Charge');
    
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + parseInt(days));

    // Get recurring charges due soon
    const upcomingRecurring = await Charge.find({
      school: req.user.school,
      isRecurring: true,
      'recurringSettings.isActive': true,
      'recurringSettings.nextDueDate': {
        $gte: new Date(),
        $lte: upcomingDate
      }
    })
    .populate('createdBy', 'name')
    .sort({ 'recurringSettings.nextDueDate': 1 });

    // Get overdue payments
    const overdueCharges = await Charge.find({
      school: req.user.school,
      paymentStatus: 'overdue'
    })
    .populate('createdBy', 'name')
    .sort({ purchaseDate: 1 });

    res.json({
      upcomingRecurring,
      overdueCharges,
      totalUpcoming: upcomingRecurring.length,
      totalOverdue: overdueCharges.length
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get upcoming payments',
      error: error.message
    });
  }
});

// Create charge from template
router.post('/from-template', isAdminOrHigher, async (req, res) => {
  try {
    const { templateName, customFields } = req.body;
    
    // This is a placeholder - in a real implementation, you'd have a templates collection
    const templates = {
      'monthly_electricity': {
        title: 'Monthly Electricity Bill',
        category: 'utilities',
        subCategory: 'Electricity',
        isRecurring: true,
        recurringSettings: {
          frequency: 'monthly',
          nextDueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
        },
        priority: 'high'
      },
      'office_supplies': {
        title: 'Office Supplies Purchase',
        category: 'supplies',
        subCategory: 'Office Supplies',
        priority: 'medium'
      }
    };

    const template = templates[templateName];
    if (!template) {
      return res.status(404).json({
        message: 'Template not found'
      });
    }

    // Merge template with custom fields
    const chargeData = {
      ...template,
      ...customFields,
      school: req.user.school,
      createdBy: req.user._id
    };

    const Charge = require('../models/Charge');
    const charge = new Charge(chargeData);
    await charge.save();

    await charge.populate([
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      message: 'Charge created from template successfully',
      charge
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to create charge from template',
      error: error.message
    });
  }
});

// Mark charge as overdue (background job simulation)
router.put('/:id/mark-overdue', isAdminOrHigher, async (req, res) => {
  try {
    const { id } = req.params;
    const Charge = require('../models/Charge');
    
    const charge = await Charge.findOneAndUpdate(
      {
        _id: id,
        school: req.user.school,
        paymentStatus: 'pending'
      },
      {
        paymentStatus: 'overdue',
        updatedBy: req.user._id
      },
      { new: true }
    );

    if (!charge) {
      return res.status(404).json({
        message: 'Charge not found or already processed'
      });
    }

    res.json({
      message: 'Charge marked as overdue',
      charge
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to mark charge as overdue',
      error: error.message
    });
  }
});

// Get charge statistics dashboard
router.get('/dashboard/stats', isAdminOrHigher, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const Charge = require('../models/Charge');
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        dateFilter = { purchaseDate: { $gte: weekStart } };
        break;
      case 'month':
        dateFilter = {
          purchaseDate: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1)
          }
        };
        break;
      case 'quarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        dateFilter = { purchaseDate: { $gte: quarterStart } };
        break;
      case 'year':
        dateFilter = {
          purchaseDate: {
            $gte: new Date(now.getFullYear(), 0, 1)
          }
        };
        break;
    }

    const stats = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalCharges: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
          },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] }
          },
          highPriorityCount: {
            $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
          },
          recurringCount: {
            $sum: { $cond: [{ $eq: ['$isRecurring', true] }, 1, 0] }
          }
        }
      }
    ]);

    const categoryStats = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      overview: stats[0] || {
        totalCharges: 0,
        totalAmount: 0,
        averageAmount: 0,
        pendingCount: 0,
        paidCount: 0,
        overdueCount: 0,
        highPriorityCount: 0,
        recurringCount: 0
      },
      categoryBreakdown: categoryStats,
      period,
      generatedAt: new Date()
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get dashboard statistics',
      error: error.message
    });
  }
});

// Search charges with advanced filters
router.get('/search/advanced', isAdminOrHigher, async (req, res) => {
  try {
    const {
      query,
      categories,
      paymentStatuses,
      priorities,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      suppliers,
      isRecurring,
      page = 1,
      limit = 20
    } = req.query;

    const Charge = require('../models/Charge');
    let filter = { school: req.user.school };

    // Text search
    if (query) {
      filter.$or = [
        { title: new RegExp(query, 'i') },
        { description: new RegExp(query, 'i') },
        { notes: new RegExp(query, 'i') },
        { 'supplier.name': new RegExp(query, 'i') }
      ];
    }

    // Category filter
    if (categories) {
      const categoryArray = Array.isArray(categories) ? categories : categories.split(',');
      filter.category = { $in: categoryArray };
    }

    // Payment status filter
    if (paymentStatuses) {
      const statusArray = Array.isArray(paymentStatuses) ? paymentStatuses : paymentStatuses.split(',');
      filter.paymentStatus = { $in: statusArray };
    }

    // Priority filter
    if (priorities) {
      const priorityArray = Array.isArray(priorities) ? priorities : priorities.split(',');
      filter.priority = { $in: priorityArray };
    }

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

    // Supplier filter
    if (suppliers) {
      const supplierArray = Array.isArray(suppliers) ? suppliers : suppliers.split(',');
      filter['supplier.name'] = { $in: supplierArray.map(s => new RegExp(s, 'i')) };
    }

    // Recurring filter
    if (isRecurring !== undefined) {
      filter.isRecurring = isRecurring === 'true';
    }

    const charges = await Charge.find(filter)
      .populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'approvedBy', select: 'name email' }
      ])
      .sort({ purchaseDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalCharges = await Charge.countDocuments(filter);

    res.json({
      charges,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCharges / limit),
        totalCharges,
        hasNextPage: page < Math.ceil(totalCharges / limit),
        hasPrevPage: page > 1
      },
      filters: {
        query,
        categories,
        paymentStatuses,
        priorities,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        suppliers,
        isRecurring
      }
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to search charges',
      error: error.message
    });
  }
});

module.exports = router;