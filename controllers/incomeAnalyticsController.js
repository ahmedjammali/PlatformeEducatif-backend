// Income Analytics Controller - FIXED VERSION
// Keeps your original logic but adds safe payment history support

const StudentPayment = require('../models/StudentPayment');
// ✅ FIXED helper function - properly handles annual payments
const calculateDateRangePaidAmountsFromHistory = (payment, startDate, endDate) => {
  const dateRangePaidAmounts = {
    inscriptionFee: 0,
    tuition: 0,
    uniform: 0,
    transportation: 0
  };

  if (!startDate && !endDate) {
    // No date filter - return all paid amounts
    return {
      inscriptionFee: payment.paidAmounts?.inscriptionFee || 0,
      tuition: payment.paidAmounts?.tuition || 0,
      uniform: payment.paidAmounts?.uniform || 0,
      transportation: payment.paidAmounts?.transportation || 0
    };
  }

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  // Inscription Fee
  if (payment.inscriptionFee?.paymentHistory && payment.inscriptionFee.paymentHistory.length > 0) {
    payment.inscriptionFee.paymentHistory.forEach(transaction => {
      const transactionDate = new Date(transaction.paymentDate);
      if ((!start || transactionDate >= start) && (!end || transactionDate <= end)) {
        dateRangePaidAmounts.inscriptionFee += transaction.amount;
      }
    });
  }

  // Uniform
  if (payment.uniform?.paymentHistory && payment.uniform.paymentHistory.length > 0) {
    payment.uniform.paymentHistory.forEach(transaction => {
      const transactionDate = new Date(transaction.paymentDate);
      if ((!start || transactionDate >= start) && (!end || transactionDate <= end)) {
        dateRangePaidAmounts.uniform += transaction.amount;
      }
    });
  }

  // ✅ CRITICAL FIX: Annual Tuition Payment
  if (payment.paymentType === 'annual' && payment.annualTuitionPayment?.isPaid) {
    // Student paid annual tuition - check payment history
    if (payment.annualTuitionPayment?.paymentHistory && payment.annualTuitionPayment.paymentHistory.length > 0) {
      payment.annualTuitionPayment.paymentHistory.forEach(transaction => {
        const transactionDate = new Date(transaction.paymentDate);
        if ((!start || transactionDate >= start) && (!end || transactionDate <= end)) {
          dateRangePaidAmounts.tuition += transaction.amount;
        }
      });
    } else {
      // ✅ FALLBACK: If no payment history exists, but payment is marked as paid
      // This should not happen with the new structure, but just in case
      console.warn(`Annual payment marked as paid but no payment history found for student ${payment.student}`);
      // If there's no date filter or if we can't verify the date, include the full amount
      if (!start && !end) {
        dateRangePaidAmounts.tuition = payment.paidAmounts?.tuition || 0;
      }
    }
  } else {
    // ✅ Monthly tuition payments
    if (payment.tuitionMonthlyPayments && Array.isArray(payment.tuitionMonthlyPayments)) {
      payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
        if (monthlyPayment?.paymentHistory && monthlyPayment.paymentHistory.length > 0) {
          monthlyPayment.paymentHistory.forEach(transaction => {
            const transactionDate = new Date(transaction.paymentDate);
            if ((!start || transactionDate >= start) && (!end || transactionDate <= end)) {
              dateRangePaidAmounts.tuition += transaction.amount;
            }
          });
        }
      });
    }
  }

  // Monthly Transportation Payments
  if (payment.transportation?.monthlyPayments && Array.isArray(payment.transportation.monthlyPayments)) {
    payment.transportation.monthlyPayments.forEach(monthlyPayment => {
      if (monthlyPayment?.paymentHistory && monthlyPayment.paymentHistory.length > 0) {
        monthlyPayment.paymentHistory.forEach(transaction => {
          const transactionDate = new Date(transaction.paymentDate);
          if ((!start || transactionDate >= start) && (!end || transactionDate <= end)) {
            dateRangePaidAmounts.transportation += transaction.amount;
          }
        });
      }
    });
  }

  return dateRangePaidAmounts;
};
// Main income analytics endpoint
const getIncomeAnalytics = async (req, res) => {
  try {
    const {
      grade,
      component,
      category,
      startDate,
      endDate,
      month,
      academicYear
    } = req.query;
    const schoolId = req.schoolId;

    // Build filter object
    let filter = {};
    if (schoolId) filter.school = schoolId;
    if (grade) filter.grade = grade;
    if (category) filter.gradeCategory = category;
    if (academicYear) filter.academicYear = academicYear;

    // Get all student payments matching basic filters
    let studentPayments = await StudentPayment.find(filter)
      .populate('student', 'name email')
      .populate('school', 'name')
      .lean();

    // ✅ SAFE: Filter students who have payments in the date range
    if (startDate || endDate) {
      studentPayments = studentPayments.filter(payment => {
        const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);
        const totalPaidInRange = dateRangePaidAmounts.inscriptionFee +
                                dateRangePaidAmounts.tuition +
                                dateRangePaidAmounts.uniform +
                                dateRangePaidAmounts.transportation;
        return totalPaidInRange > 0;
      });
    } else {
      // Filter out students with 0 collected amounts (no date filter)
      studentPayments = studentPayments.filter(payment => 
        payment.paidAmounts?.grandTotal > 0
      );
    }

    // Filter by component if specified
    if (component) {
      studentPayments = studentPayments.filter(payment => {
        switch (component) {
          case 'frais_scolaires':
            return (payment.totalAmounts?.tuition || 0) > 0;
          case 'frais_inscription':
            return (payment.totalAmounts?.inscriptionFee || 0) > 0;
          case 'uniforme':
            return (payment.totalAmounts?.uniform || 0) > 0;
          case 'transport':
            return (payment.totalAmounts?.transportation || 0) > 0;
          default:
            return true;
        }
      });
    }

    // 1. Component Analysis
    const componentAnalysis = {
      frais_scolaires: { name: 'Frais Scolaires', attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
      frais_inscription: { name: 'Frais d\'Inscription', attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
      uniforme: { name: 'Uniforme', attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
      transport: { name: 'Transport', attendu: 0, collecte: 0, en_attente: 0, taux: 0 }
    };

    studentPayments.forEach(payment => {
      const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);

      // Frais scolaires
      componentAnalysis.frais_scolaires.attendu += payment.totalAmounts?.tuition || 0;
      componentAnalysis.frais_scolaires.collecte += dateRangePaidAmounts.tuition;
      componentAnalysis.frais_scolaires.en_attente += ((payment.totalAmounts?.tuition || 0) - (payment.paidAmounts?.tuition || 0));

      // Frais inscription
      componentAnalysis.frais_inscription.attendu += payment.totalAmounts?.inscriptionFee || 0;
      componentAnalysis.frais_inscription.collecte += dateRangePaidAmounts.inscriptionFee;
      componentAnalysis.frais_inscription.en_attente += ((payment.totalAmounts?.inscriptionFee || 0) - (payment.paidAmounts?.inscriptionFee || 0));

      // Uniforme
      componentAnalysis.uniforme.attendu += payment.totalAmounts?.uniform || 0;
      componentAnalysis.uniforme.collecte += dateRangePaidAmounts.uniform;
      componentAnalysis.uniforme.en_attente += ((payment.totalAmounts?.uniform || 0) - (payment.paidAmounts?.uniform || 0));

      // Transport
      componentAnalysis.transport.attendu += payment.totalAmounts?.transportation || 0;
      componentAnalysis.transport.collecte += dateRangePaidAmounts.transportation;
      componentAnalysis.transport.en_attente += ((payment.totalAmounts?.transportation || 0) - (payment.paidAmounts?.transportation || 0));
    });

    // Calculate rates
    Object.keys(componentAnalysis).forEach(key => {
      const component = componentAnalysis[key];
      component.taux = component.attendu > 0 ?
        Math.round((component.collecte / component.attendu) * 100) : 0;
    });

    // 2. Level Analysis
    const levelAnalysis = {};

    studentPayments.forEach(payment => {
      const level = payment.grade;
      if (!level) return;

      if (!levelAnalysis[level]) {
        levelAnalysis[level] = {
          niveau: level,
          categorie: payment.gradeCategory,
          nbr_etudiants: 0,
          attendu: 0,
          collecte: 0,
          en_attente: 0,
          taux: 0
        };
      }

      const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);
      const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                               dateRangePaidAmounts.tuition +
                               dateRangePaidAmounts.uniform +
                               dateRangePaidAmounts.transportation;

      levelAnalysis[level].nbr_etudiants += 1;
      levelAnalysis[level].attendu += payment.totalAmounts?.grandTotal || 0;
      levelAnalysis[level].collecte += dateRangeTotalPaid;
      levelAnalysis[level].en_attente += ((payment.totalAmounts?.grandTotal || 0) - (payment.paidAmounts?.grandTotal || 0));
    });

    // Calculate rates
    Object.keys(levelAnalysis).forEach(level => {
      const analysis = levelAnalysis[level];
      analysis.taux = analysis.attendu > 0 ?
        Math.round((analysis.collecte / analysis.attendu) * 100) : 0;
    });

    // Convert to array and sort
    const levelAnalysisArray = Object.values(levelAnalysis).sort((a, b) => {
      if (a.categorie !== b.categorie) {
        const categoryOrder = { maternelle: 1, primaire: 2, secondaire: 3 };
        return (categoryOrder[a.categorie] || 99) - (categoryOrder[b.categorie] || 99);
      }
      return a.niveau.localeCompare(b.niveau);
    });

    // 3. Student Analysis
    const studentAnalysis = studentPayments.map(payment => {
      const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);
      const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                               dateRangePaidAmounts.tuition +
                               dateRangePaidAmounts.uniform +
                               dateRangePaidAmounts.transportation;

      // Calculate discount
      let discountAmount = 0;
      if (payment.discount?.enabled) {
        if (payment.discount.type === 'annual') {
          discountAmount = ((payment.totalAmounts?.tuition || 0) * payment.discount.percentage) / 100;
        } else if (payment.discount.type === 'monthly') {
          discountAmount = ((payment.tuitionFees?.monthlyAmount || 0) * payment.discount.percentage) / 100 * 12;
        }
      }

      // Determine status
      let statut = 'En cours';
      const grandTotal = payment.totalAmounts?.grandTotal || 0;
      const grandTotalPaid = payment.paidAmounts?.grandTotal || 0;
      const remaining = grandTotal - grandTotalPaid;
      
      if (remaining === 0) {
        statut = 'Payé';
      } else if (grandTotalPaid === 0) {
        statut = 'Non payé';
      } else if (remaining > grandTotal * 0.5) {
        statut = 'Partiellement payé';
      }

      // Payment breakdown
      const paymentBreakdown = {
        inscriptionFee: {
          applicable: payment.inscriptionFee?.applicable || false,
          total: payment.totalAmounts?.inscriptionFee || 0,
          paid: dateRangePaidAmounts.inscriptionFee,
          totalPaidOverall: payment.paidAmounts?.inscriptionFee || 0,
          isPaid: payment.inscriptionFee?.isPaid || false,
          transactionCount: payment.inscriptionFee?.paymentHistory?.length || 0
        },
        fraisScolaires: {
          total: payment.totalAmounts?.tuition || 0,
          paid: dateRangePaidAmounts.tuition,
          totalPaidOverall: payment.paidAmounts?.tuition || 0,
          type: payment.paymentType,
          monthlyAmount: payment.tuitionFees?.monthlyAmount || 0,
          transactionCount: (payment.tuitionMonthlyPayments || []).reduce(
            (sum, m) => sum + (m.paymentHistory?.length || 0), 0
          )
        },
        uniform: {
          applicable: payment.uniform?.purchased || false,
          total: payment.totalAmounts?.uniform || 0,
          paid: dateRangePaidAmounts.uniform,
          totalPaidOverall: payment.paidAmounts?.uniform || 0,
          isPaid: payment.uniform?.isPaid || false,
          transactionCount: payment.uniform?.paymentHistory?.length || 0
        },
        transport: {
          applicable: payment.transportation?.using || false,
          total: payment.totalAmounts?.transportation || 0,
          paid: dateRangePaidAmounts.transportation,
          totalPaidOverall: payment.paidAmounts?.transportation || 0,
          type: payment.transportation?.type,
          monthlyAmount: payment.transportation?.monthlyPrice || 0,
          transactionCount: (payment.transportation?.monthlyPayments || []).reduce(
            (sum, m) => sum + (m.paymentHistory?.length || 0), 0
          )
        }
      };

      return {
        studentId: payment.student?._id,
        nom: payment.student?.name || 'Unknown',
        email: payment.student?.email || '',
        niveau: payment.grade,
        categorie: payment.gradeCategory,
        totalPaid: dateRangeTotalPaid,
        totalPaidOverall: grandTotalPaid,
        paymentBreakdown: paymentBreakdown,
        statut: statut,
        remise: discountAmount,
        pourcentage_remise: payment.discount?.enabled ? payment.discount.percentage : 0,
        academicYear: payment.academicYear
      };
    });

    // Sort by name
    studentAnalysis.sort((a, b) => a.nom.localeCompare(b.nom));

    // 4. Summary Statistics
    let totalDateRangePaid = 0;
    studentPayments.forEach(payment => {
      const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);
      totalDateRangePaid += dateRangePaidAmounts.inscriptionFee +
                          dateRangePaidAmounts.tuition +
                          dateRangePaidAmounts.uniform +
                          dateRangePaidAmounts.transportation;
    });

    const totalAttendu = studentPayments.reduce((sum, payment) => sum + (payment.totalAmounts?.grandTotal || 0), 0);
    const totalPaidOverall = studentPayments.reduce((sum, payment) => sum + (payment.paidAmounts?.grandTotal || 0), 0);

    const summary = {
      total_etudiants: studentPayments.length,
      total_attendu: totalAttendu,
      total_collecte: totalDateRangePaid,
      total_collecte_overall: totalPaidOverall,
      total_en_attente: totalAttendu - totalPaidOverall,
      taux_global: totalAttendu > 0 ? Math.round((totalPaidOverall / totalAttendu) * 100) : 0,
      taux_date_range: totalAttendu > 0 ? Math.round((totalDateRangePaid / totalAttendu) * 100) : 0,
      total_remises: studentAnalysis.reduce((sum, student) => sum + student.remise, 0)
    };

    // 5. Category Breakdown
    const categoryBreakdown = {
      maternelle: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
      primaire: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
      secondaire: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 }
    };

    studentPayments.forEach(payment => {
      const category = payment.gradeCategory;
      if (category && categoryBreakdown[category]) {
        const dateRangePaidAmounts = calculateDateRangePaidAmountsFromHistory(payment, startDate, endDate);
        const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                                 dateRangePaidAmounts.tuition +
                                 dateRangePaidAmounts.uniform +
                                 dateRangePaidAmounts.transportation;

        categoryBreakdown[category].etudiants += 1;
        categoryBreakdown[category].attendu += payment.totalAmounts?.grandTotal || 0;
        categoryBreakdown[category].collecte += dateRangeTotalPaid;
        categoryBreakdown[category].en_attente += ((payment.totalAmounts?.grandTotal || 0) - (payment.paidAmounts?.grandTotal || 0));
      }
    });

    // Calculate rates
    Object.keys(categoryBreakdown).forEach(category => {
      const cat = categoryBreakdown[category];
      cat.taux = cat.attendu > 0 ? Math.round((cat.collecte / cat.attendu) * 100) : 0;
    });

    // Response
    const response = {
      success: true,
      message: 'Analyse des revenus récupérée avec succès',
      data: {
        summary,
        componentAnalysis,
        levelAnalysis: levelAnalysisArray,
        studentAnalysis,
        categoryBreakdown,
        filters: {
          schoolId,
          grade,
          component,
          category,
          startDate,
          endDate,
          academicYear
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'analyse des revenus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur',
      error: error.message
    });
  }
};

// Get available filter options
const getIncomeFilters = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    let filter = {};
    if (schoolId) filter.school = schoolId;

    const grades = await StudentPayment.distinct('grade', filter);
    const academicYears = await StudentPayment.distinct('academicYear', filter);
    const categories = await StudentPayment.distinct('gradeCategory', filter);

    const components = [
      { value: 'frais_scolaires', label: 'Frais Scolaires' },
      { value: 'frais_inscription', label: 'Frais d\'Inscription' },
      { value: 'uniforme', label: 'Uniforme' },
      { value: 'transport', label: 'Transport' }
    ];

    res.status(200).json({
      success: true,
      data: {
        grades: grades.sort(),
        categories: categories.sort(),
        components,
        academicYears: academicYears.sort().reverse()
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des filtres:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur',
      error: error.message
    });
  }
};

module.exports = {
  getIncomeAnalytics,
  getIncomeFilters,
  calculateDateRangePaidAmountsFromHistory
};