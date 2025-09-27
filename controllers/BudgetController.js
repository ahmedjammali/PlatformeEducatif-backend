// controllers/BudgetController.js
const Charge = require('../models/Charge');
const ChargeCategory = require('../models/ChargeCategory');
const mongoose = require('mongoose');

// Get budget overview and spending analysis
const getBudgetOverview = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month } = req.query;
    const schoolFilter = { school: req.user.school };

    // Date filters
    let dateFilter = {};
    if (month) {
      dateFilter = {
        purchaseDate: {
          $gte: new Date(year, month - 1, 1),
          $lt: new Date(year, month, 1)
        }
      };
    } else {
      dateFilter = {
        purchaseDate: {
          $gte: new Date(year, 0, 1),
          $lt: new Date(year + 1, 0, 1)
        }
      };
    }

    // Get categories with budget limits
    const categories = await ChargeCategory.find({
      $or: [
        { school: req.user.school },
        { isSystemDefined: true }
      ],
      isActive: true
    });

    // Get actual spending by category
    const categorySpending = await Charge.aggregate([
      {
        $match: {
          ...schoolFilter,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$category',
          totalSpent: { $sum: '$amount' },
          chargeCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          lastCharge: { $max: '$purchaseDate' }
        }
      }
    ]);

    // Combine budget limits with actual spending
    const budgetAnalysis = categories.map(category => {
      const spending = categorySpending.find(s => s._id === category.name) || {
        totalSpent: 0,
        chargeCount: 0,
        avgAmount: 0,
        lastCharge: null
      };

      const budgetLimit = month ? 
        category.budgetLimit?.monthly : 
        category.budgetLimit?.yearly;

      let status = 'safe';
      let percentage = 0;

      if (budgetLimit && budgetLimit > 0) {
        percentage = (spending.totalSpent / budgetLimit) * 100;
        
        if (percentage >= 100) status = 'exceeded';
        else if (percentage >= 80) status = 'warning';
        else if (percentage >= 60) status = 'caution';
      }

      return {
        category: category.name,
        categoryInfo: {
          name: category.name,
          description: category.description,
          icon: category.icon,
          color: category.color
        },
        budgetLimit,
        actualSpending: spending.totalSpent,
        chargeCount: spending.chargeCount,
        avgAmount: spending.avgAmount,
        lastCharge: spending.lastCharge,
        percentage,
        status,
        remaining: budgetLimit ? Math.max(0, budgetLimit - spending.totalSpent) : null
      };
    });

    // Overall budget summary
    const totalBudget = categories.reduce((sum, cat) => {
      const limit = month ? cat.budgetLimit?.monthly : cat.budgetLimit?.yearly;
      return sum + (limit || 0);
    }, 0);

    const totalSpent = categorySpending.reduce((sum, spending) => sum + spending.totalSpent, 0);

    const summary = {
      totalBudget,
      totalSpent,
      remaining: totalBudget - totalSpent,
      percentage: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      period: month ? `${year}-${month.toString().padStart(2, '0')}` : year.toString()
    };

    res.json({
      summary,
      categoryAnalysis: budgetAnalysis,
      categories: categories.length,
      totalCharges: categorySpending.reduce((sum, s) => sum + s.chargeCount, 0)
    });

  } catch (error) {
    console.error('Error getting budget overview:', error);
    res.status(500).json({
      message: 'Failed to retrieve budget overview',
      error: error.message
    });
  }
};

// Set budget limits for categories
const setBudgetLimits = async (req, res) => {
  try {
    const { budgets } = req.body; // Array of {categoryName, monthly, quarterly, yearly}

    if (!budgets || !Array.isArray(budgets)) {
      return res.status(400).json({
        message: 'Budgets array is required'
      });
    }

    const results = [];
    
    for (const budget of budgets) {
      const { categoryName, monthly, quarterly, yearly } = budget;
      
      const category = await ChargeCategory.findOneAndUpdate(
        {
          name: categoryName,
          $or: [
            { school: req.user.school },
            { isSystemDefined: true }
          ]
        },
        {
          $set: {
            'budgetLimit.monthly': monthly || 0,
            'budgetLimit.quarterly': quarterly || 0,
            'budgetLimit.yearly': yearly || 0
          }
        },
        { new: true }
      );

      if (category) {
        results.push({
          category: categoryName,
          updated: true,
          budgetLimit: category.budgetLimit
        });
      } else {
        results.push({
          category: categoryName,
          updated: false,
          error: 'Category not found'
        });
      }
    }

    res.json({
      message: 'Budget limits updated',
      results
    });

  } catch (error) {
    console.error('Error setting budget limits:', error);
    res.status(500).json({
      message: 'Failed to set budget limits',
      error: error.message
    });
  }
};

// Get spending trends and forecasting
const getSpendingTrends = async (req, res) => {
  try {
    const { category, months = 12 } = req.query;
    const schoolFilter = { school: req.user.school };

    // Calculate date range for the specified months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    let matchFilter = {
      ...schoolFilter,
      purchaseDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (category) {
      matchFilter.category = category;
    }

    // Monthly spending trends
    const monthlyTrends = await Charge.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            year: { $year: '$purchaseDate' },
            month: { $month: '$purchaseDate' }
          },
          totalAmount: { $sum: '$amount' },
          chargeCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Calculate trend direction and forecasting
    const amounts = monthlyTrends.map(trend => trend.totalAmount);
    let trendDirection = 'stable';
    let forecastNext = 0;

    if (amounts.length >= 2) {
      const recent = amounts.slice(-3); // Last 3 months
      const older = amounts.slice(-6, -3); // Previous 3 months
      
      const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const olderAvg = older.length > 0 ? older.reduce((sum, val) => sum + val, 0) / older.length : recentAvg;
      
      if (recentAvg > olderAvg * 1.1) trendDirection = 'increasing';
      else if (recentAvg < olderAvg * 0.9) trendDirection = 'decreasing';
      
      // Simple linear forecast
      if (amounts.length >= 3) {
        const lastThree = amounts.slice(-3);
        forecastNext = lastThree[2] + (lastThree[2] - lastThree[0]) / 2;
        forecastNext = Math.max(0, forecastNext); // Ensure non-negative
      }
    }

    // Category breakdown if no specific category requested
    let categoryBreakdown = [];
    if (!category) {
      categoryBreakdown = await Charge.aggregate([
        { $match: { ...schoolFilter, purchaseDate: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            chargeCount: { $sum: 1 },
            avgAmount: { $avg: '$amount' },
            trend: {
              $push: {
                month: { $month: '$purchaseDate' },
                year: { $year: '$purchaseDate' },
                amount: '$amount'
              }
            }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);
    }

    res.json({
      monthlyTrends,
      trendDirection,
      forecastNext: Math.round(forecastNext * 100) / 100,
      categoryBreakdown,
      period: {
        startDate,
        endDate,
        months: parseInt(months)
      },
      totalSpent: amounts.reduce((sum, val) => sum + val, 0),
      averageMonthly: amounts.length > 0 ? amounts.reduce((sum, val) => sum + val, 0) / amounts.length : 0
    });

  } catch (error) {
    console.error('Error getting spending trends:', error);
    res.status(500).json({
      message: 'Failed to retrieve spending trends',
      error: error.message
    });
  }
};

// Get budget alerts and notifications
const getBudgetAlerts = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get categories with budget limits
    const categories = await ChargeCategory.find({
      $or: [
        { school: req.user.school },
        { isSystemDefined: true }
      ],
      isActive: true,
      $or: [
        { 'budgetLimit.monthly': { $gt: 0 } },
        { 'budgetLimit.yearly': { $gt: 0 } }
      ]
    });

    const alerts = [];

    for (const category of categories) {
      // Monthly budget check
      if (category.budgetLimit?.monthly > 0) {
        const monthlySpending = await Charge.aggregate([
          {
            $match: {
              school: req.user.school,
              category: category.name,
              purchaseDate: {
                $gte: new Date(currentYear, currentMonth - 1, 1),
                $lt: new Date(currentYear, currentMonth, 1)
              }
            }
          },
          {
            $group: {
              _id: null,
              totalSpent: { $sum: '$amount' }
            }
          }
        ]);

        const spent = monthlySpending[0]?.totalSpent || 0;
        const percentage = (spent / category.budgetLimit.monthly) * 100;

        if (percentage >= 90) {
          alerts.push({
            type: 'critical',
            category: category.name,
            message: `${category.name} budget critically exceeded (${percentage.toFixed(1)}%)`,
            budgetLimit: category.budgetLimit.monthly,
            actualSpending: spent,
            percentage,
            period: 'monthly',
            icon: category.icon,
            color: '#EF4444'
          });
        } else if (percentage >= 80) {
          alerts.push({
            type: 'warning',
            category: category.name,
            message: `${category.name} budget warning (${percentage.toFixed(1)}%)`,
            budgetLimit: category.budgetLimit.monthly,
            actualSpending: spent,
            percentage,
            period: 'monthly',
            icon: category.icon,
            color: '#F59E0B'
          });
        }
      }

      // Yearly budget check
      if (category.budgetLimit?.yearly > 0) {
        const yearlySpending = await Charge.aggregate([
          {
            $match: {
              school: req.user.school,
              category: category.name,
              purchaseDate: {
                $gte: new Date(currentYear, 0, 1),
                $lt: new Date(currentYear + 1, 0, 1)
              }
            }
          },
          {
            $group: {
              _id: null,
              totalSpent: { $sum: '$amount' }
            }
          }
        ]);

        const spent = yearlySpending[0]?.totalSpent || 0;
        const percentage = (spent / category.budgetLimit.yearly) * 100;

        if (percentage >= 90) {
          alerts.push({
            type: 'critical',
            category: category.name,
            message: `${category.name} yearly budget critically exceeded (${percentage.toFixed(1)}%)`,
            budgetLimit: category.budgetLimit.yearly,
            actualSpending: spent,
            percentage,
            period: 'yearly',
            icon: category.icon,
            color: '#EF4444'
          });
        } else if (percentage >= 80) {
          alerts.push({
            type: 'warning',
            category: category.name,
            message: `${category.name} yearly budget warning (${percentage.toFixed(1)}%)`,
            budgetLimit: category.budgetLimit.yearly,
            actualSpending: spent,
            percentage,
            period: 'yearly',
            icon: category.icon,
            color: '#F59E0B'
          });
        }
      }
    }

    // Check for unusual spending patterns
    const unusualSpending = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          purchaseDate: {
            $gte: new Date(currentYear, currentMonth - 1, 1),
            $lt: new Date(currentYear, currentMonth, 1)
          }
        }
      },
      {
        $group: {
          _id: '$category',
          currentMonthTotal: { $sum: '$amount' },
          chargeCount: { $sum: 1 }
        }
      }
    ]);

    // Compare with previous months average
    for (const spending of unusualSpending) {
      const previousMonthsAvg = await Charge.aggregate([
        {
          $match: {
            school: req.user.school,
            category: spending._id,
            purchaseDate: {
              $gte: new Date(currentYear, currentMonth - 4, 1), // Last 3 months
              $lt: new Date(currentYear, currentMonth - 1, 1)
            }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$purchaseDate' },
              year: { $year: '$purchaseDate' }
            },
            monthlyTotal: { $sum: '$amount' }
          }
        },
        {
          $group: {
            _id: null,
            avgMonthly: { $avg: '$monthlyTotal' }
          }
        }
      ]);

      const avgPrevious = previousMonthsAvg[0]?.avgMonthly || 0;
      if (avgPrevious > 0 && spending.currentMonthTotal > avgPrevious * 1.5) {
        alerts.push({
          type: 'info',
          category: spending._id,
          message: `Unusual spending spike in ${spending._id} (${((spending.currentMonthTotal / avgPrevious - 1) * 100).toFixed(1)}% above average)`,
          currentSpending: spending.currentMonthTotal,
          averageSpending: avgPrevious,
          period: 'monthly',
          icon: '📈',
          color: '#3B82F6'
        });
      }
    }

    // Sort alerts by severity
    const sortOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => sortOrder[a.type] - sortOrder[b.type]);

    res.json({
      alerts,
      totalAlerts: alerts.length,
      criticalCount: alerts.filter(a => a.type === 'critical').length,
      warningCount: alerts.filter(a => a.type === 'warning').length,
      infoCount: alerts.filter(a => a.type === 'info').length,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Error getting budget alerts:', error);
    res.status(500).json({
      message: 'Failed to retrieve budget alerts',
      error: error.message
    });
  }
};

// Generate budget report
const generateBudgetReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      includeCategories = true, 
      includeComparisons = true,
      format = 'json' 
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Start date and end date are required'
      });
    }

    const dateFilter = {
      purchaseDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    // Overall summary
    const overallSummary = await Charge.aggregate([
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
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$amount', 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] }
          }
        }
      }
    ]);

    let categoryBreakdown = [];
    if (includeCategories) {
      categoryBreakdown = await Charge.aggregate([
        {
          $match: {
            school: req.user.school,
            ...dateFilter
          }
        },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            chargeCount: { $sum: 1 },
            avgAmount: { $avg: '$amount' },
            maxAmount: { $max: '$amount' },
            minAmount: { $min: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);
    }

    let monthlyComparison = [];
    if (includeComparisons) {
      monthlyComparison = await Charge.aggregate([
        {
          $match: {
            school: req.user.school,
            ...dateFilter
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$purchaseDate' },
              month: { $month: '$purchaseDate' }
            },
            totalAmount: { $sum: '$amount' },
            chargeCount: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);
    }

    // Top suppliers
    const topSuppliers = await Charge.aggregate([
      {
        $match: {
          school: req.user.school,
          ...dateFilter,
          'supplier.name': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$supplier.name',
          totalSpent: { $sum: '$amount' },
          orderCount: { $sum: 1 },
          avgOrder: { $avg: '$amount' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    const report = {
      reportInfo: {
        generatedAt: new Date(),
        period: { startDate, endDate },
        school: req.user.school
      },
      summary: overallSummary[0] || {},
      categoryBreakdown,
      monthlyComparison,
      topSuppliers,
      metadata: {
        totalCategories: categoryBreakdown.length,
        reportPeriodDays: Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
      }
    };

    if (format === 'pdf') {
      // Placeholder for PDF generation
      return res.status(501).json({
        message: 'PDF generation coming soon',
        report
      });
    }

    res.json(report);

  } catch (error) {
    console.error('Error generating budget report:', error);
    res.status(500).json({
      message: 'Failed to generate budget report',
      error: error.message
    });
  }
};

// Compare budgets between periods
const compareBudgetPeriods = async (req, res) => {
  try {
    const { 
      period1Start, 
      period1End, 
      period2Start, 
      period2End,
      compareBy = 'category' // 'category' or 'month'
    } = req.query;

    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({
        message: 'All period dates are required'
      });
    }

    const period1Filter = {
      school: req.user.school,
      purchaseDate: {
        $gte: new Date(period1Start),
        $lte: new Date(period1End)
      }
    };

    const period2Filter = {
      school: req.user.school,
      purchaseDate: {
        $gte: new Date(period2Start),
        $lte: new Date(period2End)
      }
    };

    // Get spending for both periods
    const period1Spending = await Charge.aggregate([
      { $match: period1Filter },
      {
        $group: {
          _id: compareBy === 'category' ? '$category' : {
            month: { $month: '$purchaseDate' },
            year: { $year: '$purchaseDate' }
          },
          totalAmount: { $sum: '$amount' },
          chargeCount: { $sum: 1 }
        }
      }
    ]);

    const period2Spending = await Charge.aggregate([
      { $match: period2Filter },
      {
        $group: {
          _id: compareBy === 'category' ? '$category' : {
            month: { $month: '$purchaseDate' },
            year: { $year: '$purchaseDate' }
          },
          totalAmount: { $sum: '$amount' },
          chargeCount: { $sum: 1 }
        }
      }
    ]);

    // Combine and compare
    const comparison = [];
    const allKeys = new Set([
      ...period1Spending.map(p => JSON.stringify(p._id)),
      ...period2Spending.map(p => JSON.stringify(p._id))
    ]);

    for (const key of allKeys) {
      const parsedKey = JSON.parse(key);
      const period1Data = period1Spending.find(p => JSON.stringify(p._id) === key) || { totalAmount: 0, chargeCount: 0 };
      const period2Data = period2Spending.find(p => JSON.stringify(p._id) === key) || { totalAmount: 0, chargeCount: 0 };

      const difference = period2Data.totalAmount - period1Data.totalAmount;
      const percentageChange = period1Data.totalAmount > 0 ? 
        ((difference / period1Data.totalAmount) * 100) : 
        (period2Data.totalAmount > 0 ? 100 : 0);

      comparison.push({
        identifier: parsedKey,
        period1: period1Data,
        period2: period2Data,
        difference,
        percentageChange: Math.round(percentageChange * 100) / 100,
        trend: difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'stable'
      });
    }

    // Sort by absolute difference
    comparison.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    const summary = {
      period1Total: period1Spending.reduce((sum, p) => sum + p.totalAmount, 0),
      period2Total: period2Spending.reduce((sum, p) => sum + p.totalAmount, 0),
      totalDifference: period2Spending.reduce((sum, p) => sum + p.totalAmount, 0) - 
                      period1Spending.reduce((sum, p) => sum + p.totalAmount, 0),
      periods: {
        period1: { start: period1Start, end: period1End },
        period2: { start: period2Start, end: period2End }
      }
    };

    summary.percentageChange = summary.period1Total > 0 ? 
      ((summary.totalDifference / summary.period1Total) * 100) : 0;

    res.json({
      summary,
      comparison,
      compareBy,
      totalComparisons: comparison.length
    });

  } catch (error) {
    console.error('Error comparing budget periods:', error);
    res.status(500).json({
      message: 'Failed to compare budget periods',
      error: error.message
    });
  }
};

module.exports = {
  getBudgetOverview,
  setBudgetLimits,
  getSpendingTrends,
  getBudgetAlerts,
  generateBudgetReport,
  compareBudgetPeriods
};