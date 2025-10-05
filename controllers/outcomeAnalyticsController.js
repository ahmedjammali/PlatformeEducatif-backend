// controllers/outcomeAnalyticsController.js
const Charge = require('../models/Charge');
const TeacherAdminSalary = require('../models/TeacherAdminSalary');
const User = require('../models/User');

/**
 * Get comprehensive outcome analytics (charges + salaries)
 */
exports.getOutcomeAnalytics = async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            academicYear,
            userRole,
            chargeCategory
        } = req.query;
        const schoolId = req.schoolId;

        // Build base filters
        const chargeFilters = {};
        const salaryFilters = {};

        // Apply school filter if provided
        if (schoolId) {
            chargeFilters.school = schoolId;
            salaryFilters.school = schoolId;
        }
        console.log("school:", schoolId);

        // Apply date filters for charges
        if (startDate || endDate) {
            chargeFilters.date = {};
            if (startDate) chargeFilters.date.$gte = new Date(startDate);
            if (endDate) chargeFilters.date.$lte = new Date(endDate);
        }

        // Apply academic year filter for salaries
        if (academicYear) {
            salaryFilters.academicYear = academicYear;
        }

        // Apply category filter for charges
        if (chargeCategory) {
            chargeFilters.categorie = chargeCategory;
        }

        // Apply user role filter for salaries
        if (userRole) {
            const users = await User.find({ role: userRole }).select('_id');
            salaryFilters.user = { $in: users.map(u => u._id) };
        }

        // Get charges data
        const charges = await Charge.find(chargeFilters)
            .populate('school', 'name')
            .populate('createdBy', 'name')
            .sort({ date: -1 });

        // Get salary data
        let salaries = await TeacherAdminSalary.find(salaryFilters)
            .populate('user', 'name email role')
            .populate('school', 'name')
            .populate('salaryConfiguration')
            .sort({ academicYear: -1 });

        // Filter payment schedules within date range if dates are provided
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;

            salaries = salaries.map(salary => {
                const filteredSchedule = salary.paymentSchedule.filter(payment => {
                    // Only include payments that have been paid and within the date range
                    if (!payment.paidDate) return false;
                    
                    const paidDate = new Date(payment.paidDate);
                    if (start && paidDate < start) return false;
                    if (end && paidDate > end) return false;
                    
                    return true;
                });
                
                // Create a new object with filtered schedule
                const salaryObj = salary.toObject();
                salaryObj.paymentSchedule = filteredSchedule;
                return salaryObj;
            }).filter(salary => salary.paymentSchedule.length > 0); // Only include salaries with payments in range
        }

        // Analyze charges by category
        const chargeAnalysis = await analyzeChargesByCategory(chargeFilters);

        // Analyze salaries by role and payment type with date filters
        const salaryAnalysis = await analyzeSalariesByRole(salaryFilters, startDate, endDate);

        // Analyze monthly trends with date filters
        const monthlyTrends = await analyzeMonthlyTrends(chargeFilters, salaryFilters, startDate, endDate);

        // Calculate summary statistics from filtered data
        const totalCharges = charges.reduce((sum, charge) => sum + charge.montant, 0);
        
        const totalSalaries = salaries.reduce((sum, salary) => {
            return sum + salary.paymentSchedule.reduce((scheduleSum, payment) => {
                if (payment.paymentStatus === 'paid' || payment.paymentStatus === 'partial') {
                    return scheduleSum + (payment.paidAmount || 0);
                }
                return scheduleSum;
            }, 0);
        }, 0);

        const pendingSalaries = salaries.reduce((sum, salary) => {
            return sum + salary.paymentSchedule.reduce((scheduleSum, payment) => {
                if (payment.paymentStatus !== 'paid') {
                    return scheduleSum + (payment.totalAmount - (payment.paidAmount || 0));
                }
                return scheduleSum;
            }, 0);
        }, 0);

        const summary = {
            total_charges: totalCharges,
            total_salaries: totalSalaries,
            pending_salaries: pendingSalaries,
            total_outcome: totalCharges + totalSalaries,
            charges_count: charges.length,
            salaries_count: salaries.length,
            average_charge: charges.length > 0 ? totalCharges / charges.length : 0,
            average_salary: salaries.length > 0 ? totalSalaries / salaries.length : 0
        };

        res.json({
            success: true,
            data: {
                summary,
                chargeAnalysis,
                salaryAnalysis,
                monthlyTrends,
                charges: charges.slice(0, 50), // Limit for performance
                salaries: salaries.slice(0, 50) // Limit for performance
            }
        });

    } catch (error) {
        console.error('Error in getOutcomeAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des analyses de dépenses',
            error: error.message
        });
    }
};

/**
 * Analyze charges by category
 */
async function analyzeChargesByCategory(filters) {
    const pipeline = [
        { $match: filters },
        {
            $group: {
                _id: '$categorie',
                total_amount: { $sum: '$montant' },
                count: { $sum: 1 },
                avg_amount: { $avg: '$montant' },
                max_amount: { $max: '$montant' },
                min_amount: { $min: '$montant' },
                latest_date: { $max: '$date' },
                earliest_date: { $min: '$date' }
            }
        },
        {
            $project: {
                categorie: '$_id',
                total_amount: 1,
                count: 1,
                avg_amount: { $round: ['$avg_amount', 2] },
                max_amount: 1,
                min_amount: 1,
                latest_date: 1,
                earliest_date: 1,
                _id: 0
            }
        },
        { $sort: { total_amount: -1 } }
    ];

    return await Charge.aggregate(pipeline);
}

/**
 * Analyze salaries by role and payment type
 */
async function analyzeSalariesByRole(filters, startDate, endDate) {
    const pipeline = [
        { $match: filters },
        { $unwind: '$paymentSchedule' },
        
        // Add date filter stage for payment dates
        ...(startDate || endDate ? [{
            $match: {
                'paymentSchedule.paidDate': {
                    ...(startDate && { $gte: new Date(startDate) }),
                    ...(endDate && { $lte: new Date(endDate) })
                }
            }
        }] : []),
        
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userInfo'
            }
        },
        { $unwind: '$userInfo' },
        {
            $lookup: {
                from: 'salaryconfigurations',
                localField: 'salaryConfiguration',
                foreignField: '_id',
                as: 'configInfo'
            }
        },
        { $unwind: '$configInfo' },
        {
            $group: {
                _id: {
                    role: '$userInfo.role',
                    paymentType: '$configInfo.paymentType'
                },
                total_paid: {
                    $sum: {
                        $cond: [
                            { $in: ['$paymentSchedule.paymentStatus', ['paid', 'partial']] },
                            '$paymentSchedule.paidAmount',
                            0
                        ]
                    }
                },
                total_pending: {
                    $sum: {
                        $cond: [
                            { $ne: ['$paymentSchedule.paymentStatus', 'paid'] },
                            { $subtract: ['$paymentSchedule.totalAmount', { $ifNull: ['$paymentSchedule.paidAmount', 0] }] },
                            0
                        ]
                    }
                },
                employee_count: { $addToSet: '$user' },
                avg_salary: { $avg: '$paymentSchedule.totalAmount' },
                payment_count: { $sum: 1 },
                paid_count: {
                    $sum: { $cond: [{ $eq: ['$paymentSchedule.paymentStatus', 'paid'] }, 1, 0] }
                }
            }
        },
        {
            $project: {
                role: '$_id.role',
                paymentType: '$_id.paymentType',
                total_paid: 1,
                total_pending: 1,
                total_expected: { $add: ['$total_paid', '$total_pending'] },
                employee_count: { $size: '$employee_count' },
                avg_salary: { $round: ['$avg_salary', 2] },
                payment_count: 1,
                paid_count: 1,
                payment_rate: {
                    $round: [
                        {
                            $cond: [
                                { $eq: ['$payment_count', 0] },
                                0,
                                { $multiply: [{ $divide: ['$paid_count', '$payment_count'] }, 100] }
                            ]
                        },
                        2
                    ]
                },
                _id: 0
            }
        },
        { $sort: { total_expected: -1 } }
    ];

    return await TeacherAdminSalary.aggregate(pipeline);
}

/**
 * Analyze monthly trends for both charges and salaries
 */
async function analyzeMonthlyTrends(chargeFilters, salaryFilters, startDate, endDate) {
    // Charges monthly analysis
    const chargesPipeline = [
        { $match: chargeFilters },
        {
            $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                },
                total_charges: { $sum: '$montant' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                year: '$_id.year',
                month: '$_id.month',
                total_charges: 1,
                count: 1,
                _id: 0
            }
        },
        { $sort: { year: 1, month: 1 } }
    ];

    // Salaries monthly analysis - filter by paidDate
    const salariesPipeline = [
        { $match: salaryFilters },
        { $unwind: '$paymentSchedule' },
        
        // Add date filter for paid dates
        ...(startDate || endDate ? [{
            $match: {
                'paymentSchedule.paidDate': {
                    ...(startDate && { $gte: new Date(startDate) }),
                    ...(endDate && { $lte: new Date(endDate) })
                }
            }
        }] : []),
        
        {
            $group: {
                _id: {
                    year: { $year: '$paymentSchedule.paidDate' },
                    month: { $month: '$paymentSchedule.paidDate' }
                },
                total_salaries: { $sum: '$paymentSchedule.totalAmount' },
                paid_salaries: {
                    $sum: {
                        $cond: [
                            { $in: ['$paymentSchedule.paymentStatus', ['paid', 'partial']] },
                            '$paymentSchedule.paidAmount',
                            0
                        ]
                    }
                },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                year: '$_id.year',
                month: '$_id.month',
                total_salaries: 1,
                paid_salaries: 1,
                pending_salaries: { $subtract: ['$total_salaries', '$paid_salaries'] },
                count: 1,
                _id: 0
            }
        },
        { $sort: { year: 1, month: 1 } }
    ];

    const [chargesTrends, salariesTrends] = await Promise.all([
        Charge.aggregate(chargesPipeline),
        TeacherAdminSalary.aggregate(salariesPipeline)
    ]);

    return {
        charges: chargesTrends,
        salaries: salariesTrends
    };
}

/**
 * Get filter options for outcome analytics
 */
exports.getOutcomeFilterOptions = async (req, res) => {
    try {
        const schoolId = req.schoolId;

        const filters = schoolId ? { school: schoolId } : {};

        // Get charge categories
        const chargeCategories = await Charge.distinct('categorie', filters);

        // Get user roles from salary records
        const salaryUsers = await TeacherAdminSalary.find(filters)
            .populate('user', 'role')
            .distinct('user');

        const userRoles = [...new Set(salaryUsers.map(user => user.role))];

        // Get academic years from salary records
        const academicYears = await TeacherAdminSalary.distinct('academicYear', filters);

        // Get date ranges from charges
        const chargeDateRange = await Charge.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: null,
                    minDate: { $min: '$date' },
                    maxDate: { $max: '$date' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                chargeCategories: chargeCategories.sort(),
                userRoles: userRoles.sort(),
                academicYears: academicYears.sort().reverse(),
                dateRange: chargeDateRange[0] || { minDate: null, maxDate: null }
            }
        });

    } catch (error) {
        console.error('Error in getOutcomeFilterOptions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des options de filtre',
            error: error.message
        });
    }
};