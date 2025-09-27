// routes/budgetRoutes.js
const express = require('express');
const router = express.Router();

const {
  getBudgetOverview,
  setBudgetLimits,
  getSpendingTrends,
  getBudgetAlerts,
  generateBudgetReport,
  compareBudgetPeriods
} = require('../controllers/BudgetController');

const {
  authenticate,
  isAdminOrHigher
} = require('../middleware/auth');

// Validation middleware for budget operations
const validateBudgetLimits = (req, res, next) => {
  const { budgets } = req.body;
  
  if (!budgets || !Array.isArray(budgets) || budgets.length === 0) {
    return res.status(400).json({
      message: 'Budgets array is required and must not be empty'
    });
  }

  for (const budget of budgets) {
    const { categoryName, monthly, quarterly, yearly } = budget;
    
    if (!categoryName) {
      return res.status(400).json({
        message: 'Category name is required for each budget'
      });
    }

    // Validate budget amounts
    if (monthly !== undefined && (isNaN(monthly) || monthly < 0)) {
      return res.status(400).json({
        message: `Invalid monthly budget for ${categoryName}. Must be a positive number.`
      });
    }

    if (quarterly !== undefined && (isNaN(quarterly) || quarterly < 0)) {
      return res.status(400).json({
        message: `Invalid quarterly budget for ${categoryName}. Must be a positive number.`
      });
    }

    if (yearly !== undefined && (isNaN(yearly) || yearly < 0)) {
      return res.status(400).json({
        message: `Invalid yearly budget for ${categoryName}. Must be a positive number.`
      });
    }
  }

  next();
};

const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }

    if (start > end) {
      return res.status(400).json({
        message: 'Start date must be before end date'
      });
    }

    // Check if date range is not too large (max 5 years)
    const maxDays = 5 * 365; // 5 years
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > maxDays) {
      return res.status(400).json({
        message: 'Date range too large. Maximum allowed is 5 years.'
      });
    }
  }

  next();
};

const validateComparisonPeriods = (req, res, next) => {
  const { period1Start, period1End, period2Start, period2End } = req.query;
  
  if (!period1Start || !period1End || !period2Start || !period2End) {
    return res.status(400).json({
      message: 'All period dates are required (period1Start, period1End, period2Start, period2End)'
    });
  }

  const dates = [
    new Date(period1Start),
    new Date(period1End),
    new Date(period2Start),
    new Date(period2End)
  ];

  for (let i = 0; i < dates.length; i++) {
    if (isNaN(dates[i].getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }
  }

  if (dates[0] > dates[1]) {
    return res.status(400).json({
      message: 'Period 1: Start date must be before end date'
    });
  }

  if (dates[2] > dates[3]) {
    return res.status(400).json({
      message: 'Period 2: Start date must be before end date'
    });
  }

  next();
};

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(isAdminOrHigher);

// =================== BUDGET OVERVIEW & MANAGEMENT ===================

// Get budget overview for a specific period
router.get('/overview', getBudgetOverview);

// Set budget limits for categories
router.post('/limits', validateBudgetLimits, setBudgetLimits);

// Get budget alerts and warnings
router.get('/alerts', getBudgetAlerts);

// =================== ANALYTICS & REPORTING ===================

// Get spending trends and forecasting
router.get('/trends', getSpendingTrends);

// Generate comprehensive budget report
router.get('/report', validateDateRange, generateBudgetReport);

// Compare spending between two periods
router.get('/compare', validateComparisonPeriods, compareBudgetPeriods);

// =================== ADVANCED FEATURES ===================

// Get budget performance metrics
router.get('/performance', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const Charge = require('../models/Charge');
    const ChargeCategory = require('../models/ChargeCategory');

    // Get budget vs actual performance for each category
    const categories = await ChargeCategory.find({
      $or: [
        { school: req.user.school },
        { isSystemDefined: true }
      ],
      isActive: true,
      'budgetLimit.yearly': { $gt: 0 }
    });

    const performance = [];

    for (const category of categories) {
      const actualSpending = await Charge.aggregate([
        {
          $match: {
            school: req.user.school,
            category: category.name,
            purchaseDate: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(parseInt(year) + 1, 0, 1)
            }
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$amount' },
            chargeCount: { $sum: 1 }
          }
        }
      ]);

      const spent = actualSpending[0]?.totalSpent || 0;
      const budget = category.budgetLimit.yearly;
      const variance = spent - budget;
      const efficiency = budget > 0 ? (spent / budget) * 100 : 0;

      let status = 'excellent';
      if (efficiency > 100) status = 'over_budget';
      else if (efficiency > 90) status = 'at_risk';
      else if (efficiency > 80) status = 'good';

      performance.push({
        category: category.name,
        categoryInfo: {
          name: category.name,
          description: category.description,
          icon: category.icon,
          color: category.color
        },
        budget,
        actualSpent: spent,
        variance,
        efficiency: Math.round(efficiency * 100) / 100,
        status,
        chargeCount: actualSpending[0]?.chargeCount || 0,
        remaining: Math.max(0, budget - spent)
      });
    }

    // Overall performance summary
    const totalBudget = performance.reduce((sum, p) => sum + p.budget, 0);
    const totalSpent = performance.reduce((sum, p) => sum + p.actualSpent, 0);
    const overallEfficiency = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    const summary = {
      totalBudget,
      totalSpent,
      overallVariance: totalSpent - totalBudget,
      overallEfficiency: Math.round(overallEfficiency * 100) / 100,
      categoriesOnTrack: performance.filter(p => p.status === 'excellent' || p.status === 'good').length,
      categoriesAtRisk: performance.filter(p => p.status === 'at_risk').length,
      categoriesOverBudget: performance.filter(p => p.status === 'over_budget').length
    };

    res.json({
      summary,
      performance: performance.sort((a, b) => b.efficiency - a.efficiency),
      year: parseInt(year)
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get budget performance',
      error: error.message
    });
  }
});

// Get monthly budget projections
router.get('/projections', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const Charge = require('../models/Charge');
    
    // Get historical spending patterns
    const historicalData = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) // Last 12 months
          }
        }
      },
      {
        $group: {
          _id: {
            category: '$category',
            month: { $month: '$purchaseDate' }
          },
          avgAmount: { $avg: '$amount' },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Calculate projections based on historical patterns
    const projections = [];
    const currentDate = new Date();
    
    for (let i = 1; i <= parseInt(months); i++) {
      const futureDate = new Date(currentDate);
      futureDate.setMonth(futureDate.getMonth() + i);
      
      const month = futureDate.getMonth() + 1;
      const year = futureDate.getFullYear();
      
      const monthData = historicalData.filter(h => h._id.month === month);
      const totalProjected = monthData.reduce((sum, m) => sum + m.avgAmount, 0);
      
      projections.push({
        month,
        year,
        date: futureDate,
        projectedSpending: Math.round(totalProjected * 100) / 100,
        categoryBreakdown: monthData.map(m => ({
          category: m._id.category,
          projected: Math.round(m.avgAmount * 100) / 100
        }))
      });
    }

    res.json({
      projections,
      basedOnMonths: 12,
      projectionPeriod: parseInt(months),
      totalProjected: projections.reduce((sum, p) => sum + p.projectedSpending, 0)
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get budget projections',
      error: error.message
    });
  }
});

// Get cost optimization suggestions
router.get('/optimization', async (req, res) => {
  try {
    const Charge = require('../models/Charge');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    const suggestions = [];

    // Find categories with highest spending
    const highSpendingCategories = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(currentYear, 0, 1),
            $lt: new Date(currentYear + 1, 0, 1)
          }
        }
      },
      {
        $group: {
          _id: '$category',
          totalSpent: { $sum: '$amount' },
          chargeCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 }
    ]);

    // Suggest optimization for top spending categories
    for (const category of highSpendingCategories) {
      if (category.totalSpent > 5000) { // Threshold for suggestion
        suggestions.push({
          type: 'cost_reduction',
          category: category._id,
          message: `Consider reviewing ${category._id} expenses (${category.totalSpent.toFixed(2)} spent this year)`,
          impact: 'high',
          recommendation: `Look for bulk purchasing opportunities or alternative suppliers for ${category._id}`,
          potentialSavings: Math.round(category.totalSpent * 0.1) // Assume 10% potential savings
        });
      }
    }

    // Find recurring charges that might be optimized
    const recurringCharges = await Charge.find({
      school: req.user.school,
      isRecurring: true,
      'recurringSettings.isActive': true
    }).sort({ amount: -1 }).limit(10);

    for (const charge of recurringCharges) {
      if (charge.amount > 500) {
        suggestions.push({
          type: 'recurring_optimization',
          category: charge.category,
          message: `Review recurring charge: ${charge.title} (${charge.amount}/month)`,
          impact: 'medium',
          recommendation: 'Consider renegotiating terms or finding alternatives for high-value recurring expenses',
          potentialSavings: Math.round(charge.amount * 0.05 * 12) // 5% annual savings
        });
      }
    }

    // Identify duplicate or similar charges
    const duplicateCharges = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(currentDate.setMonth(currentDate.getMonth() - 3)) // Last 3 months
          }
        }
      },
      {
        $group: {
          _id: {
            title: '$title',
            supplier: '$supplier.name'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          charges: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicateCharges.length > 0) {
      suggestions.push({
        type: 'duplicate_review',
        message: `Found ${duplicateCharges.length} potential duplicate charges`,
        impact: 'medium',
        recommendation: 'Review similar charges to avoid duplicates and consolidate purchases',
        details: duplicateCharges.slice(0, 3) // Show top 3
      });
    }

    res.json({
      suggestions: suggestions.slice(0, 10), // Limit to top 10 suggestions
      totalSuggestions: suggestions.length,
      potentialSavings: suggestions.reduce((sum, s) => sum + (s.potentialSavings || 0), 0),
      generatedAt: new Date()
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to get optimization suggestions',
      error: error.message
    });
  }
});

module.exports = router;