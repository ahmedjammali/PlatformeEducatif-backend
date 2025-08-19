// controllers/paymentController.js - Corrected for existing users
const PaymentConfiguration = require('../models/PaymentConfiguration');
const StudentPayment = require('../models/StudentPayment');
const User = require('../models/User');

// Helper function to determine class group based on class grade
const getClassGroup = (classGrade) => {
  const ecoleGrades = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere'];
  const collegeGrades = ['9eme', '8eme', '7eme'];
  const lyceeGrades = ['4ᵉ année S', '3ᵉ année S', '2ᵉ année S', '1ʳᵉ année S'];
  
  if (ecoleGrades.includes(classGrade)) return 'école';
  if (collegeGrades.includes(classGrade)) return 'college';
  if (lyceeGrades.includes(classGrade)) return 'lycée';
  
  return 'école'; // Default
};

// Helper function to get month names
const getMonthName = (monthNumber) => {
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return months[monthNumber - 1];
};

// Helper function to generate payment schedule
const generatePaymentSchedule = (startMonth, endMonth, totalMonths, monthlyAmount, academicYear) => {
  const schedule = [];
  const currentYear = parseInt(academicYear.split('-')[0]);
  
  for (let i = 0; i < totalMonths; i++) {
    let month = startMonth + i;
    let year = currentYear;
    
    // Handle year transition
    if (month > 12) {
      month = month - 12;
      year = currentYear + 1;
    }
    
    // Set due date to the 15th of each month
    const dueDate = new Date(year, month - 1, 15);
    
    schedule.push({
      month: month,
      monthName: getMonthName(month),
      dueDate: dueDate,
      amount: monthlyAmount,
      status: 'pending',
      paidAmount: 0
    });
  }
  
  return schedule;
};
// Fixed createOrUpdatePaymentConfig function
const createOrUpdatePaymentConfig = async (req, res) => {
  try {
    const { 
      academicYear,        // ✅ GET FROM REQUEST BODY
      paymentAmounts, 
      paymentSchedule,
      gracePeriod,
      annualPaymentDiscount 
    } = req.body;
    
    const schoolId = req.schoolId;
    const userId = req.userId;
    
    // ✅ USE THE ACADEMIC YEAR FROM REQUEST, NOT CURRENT YEAR
    const targetYear = academicYear || (() => {
      // Only fallback to current year if not provided
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      return `${currentYear}-${currentYear + 1}`;
    })();
    
    console.log('Backend: Creating/updating config for year:', targetYear); // Debug log
    
    // Check if configuration already exists for this specific academic year
    let config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear  // ✅ USE THE CORRECT YEAR
    });
    
    if (config) {
      console.log('Backend: Updating existing config'); // Debug log
      // Update existing configuration
      config.paymentAmounts = paymentAmounts;
      config.paymentSchedule = paymentSchedule;
      if (gracePeriod !== undefined) config.gracePeriod = gracePeriod;
      if (annualPaymentDiscount !== undefined) config.annualPaymentDiscount = annualPaymentDiscount;
      config.updatedBy = userId;
      config.updatedAt = new Date();
    } else {
      console.log('Backend: Creating new config'); // Debug log
      // Create new configuration
      config = new PaymentConfiguration({
        school: schoolId,
        academicYear: targetYear,  // ✅ USE THE CORRECT YEAR
        paymentAmounts: paymentAmounts,
        paymentSchedule: paymentSchedule,
        gracePeriod: gracePeriod || 5,
        annualPaymentDiscount: annualPaymentDiscount || {
          enabled: false,
          percentage: 0,
          amount: 0
        },
        createdBy: userId
      });
    }

    await config.save();
    
    // ✅ REMOVE THIS LINE - Don't deactivate other configs for different years
    // if (config.isNew) {
    //   await config.deactivatePrevious();
    // }
    
    console.log('Backend: Config saved successfully:', config.academicYear); // Debug log
    
    res.status(200).json({
      message: 'Payment configuration saved successfully',
      config: config
    });
  } catch (error) {
    console.error('Backend error:', error); // Debug log
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Payment Configuration
const getPaymentConfig = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear } = req.query;
    
    // If no academic year specified, get current year
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    }).populate('createdBy', 'name');
    
    if (!config) {
      return res.status(404).json({ message: 'Payment configuration not found' });
    }
    
    res.status(200).json({ config });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Update the getAllStudentsWithPayments method in your paymentController.js

// Get All Students with Payment Status - MAIN FUNCTION FOR ADMIN PAGE
const getAllStudentsWithPayments = async (req, res) => {
  try {
    const { 
      search, 
      paymentStatus, 
      classGroup,
      classId,        // ADD THIS LINE
      academicYear, 
      page = 1, 
      limit = 50 
    } = req.query;
    const schoolId = req.schoolId;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Build student filter
    let studentFilter = { 
      school: schoolId, 
      role: 'student' 
    };
    
    // Add search filter
    if (search) {
      studentFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // ADD CLASS FILTER
    if (classId) {
      studentFilter.studentClass = classId;
    }
    
    const skip = (page - 1) * limit;
    
    // Get all students
    const students = await User.find(studentFilter)
      .populate('studentClass', 'name grade')
      .select('name email studentClass')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    const total = await User.countDocuments(studentFilter);
    
    // Get payment records for these students
    const studentIds = students.map(s => s._id);
    const paymentRecords = await StudentPayment.find({
      student: { $in: studentIds },
      academicYear: targetYear
    });
    
    // Create a map for quick lookup
    const paymentMap = {};
    paymentRecords.forEach(payment => {
      paymentMap[payment.student.toString()] = payment;
    });
    
    // Combine student data with payment info
    let studentsWithPayments = students.map(student => {
      const payment = paymentMap[student._id.toString()];
      const classGrade = student.studentClass?.grade;
      const classGroupValue = classGrade ? getClassGroup(classGrade) : null;
      
      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentClass: student.studentClass,
        classGroup: classGroupValue,
        paymentRecord: payment ? {
          _id: payment._id,
          totalAmount: payment.totalAmount,
          paidAmount: payment.paidAmount,
          remainingAmount: payment.remainingAmount,
          overallStatus: payment.overallStatus,
          paymentType: payment.paymentType,
          monthlyPayments: payment.monthlyPayments,
          annualPayment: payment.annualPayment,
          academicYear: payment.academicYear
        } : null,
        hasPaymentRecord: !!payment
      };
    });
    
    // Apply filters (only class group filter now, since classId is already handled in student query)
    if (classGroup) {
      studentsWithPayments = studentsWithPayments.filter(s => s.classGroup === classGroup);
    }
    
    if (paymentStatus) {
      if (paymentStatus === 'no_record') {
        studentsWithPayments = studentsWithPayments.filter(s => !s.hasPaymentRecord);
      } else {
        studentsWithPayments = studentsWithPayments.filter(s => 
          s.paymentRecord && s.paymentRecord.overallStatus === paymentStatus
        );
      }
    }
    
    res.status(200).json({
      students: studentsWithPayments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStudents: total
      },
      academicYear: targetYear
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Generate Payment Record for Existing Student
const generatePaymentForStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { academicYear } = req.body;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Get student information
    const student = await User.findById(studentId).populate('studentClass', 'name grade');
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Check if student belongs to this school
    if (student.school.toString() !== schoolId.toString()) {
      return res.status(403).json({ message: 'Student does not belong to your school' });
    }
    
    // Get payment configuration
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    });
    
    if (!config) {
      return res.status(404).json({ 
        message: 'Payment configuration not found. Please set up payment configuration first.' 
      });
    }
    
    // Check if payment record already exists
    const existingPayment = await StudentPayment.findOne({
      student: studentId,
      academicYear: targetYear
    });
    
    if (existingPayment) {
      return res.status(400).json({ message: 'Payment record already exists for this student' });
    }
    
    // Determine class group and amount
    const classGrade = student.studentClass?.grade; // Use grade field instead of name
    if (!classGrade) {
      return res.status(400).json({ 
        message: 'Student is not assigned to any class. Please assign student to a class first.' 
      });
    }
    
    const classGroup = getClassGroup(classGrade);
    const totalAmount = config.paymentAmounts[classGroup];
    const monthlyAmount = totalAmount / config.paymentSchedule.totalMonths;
    
    // Generate payment schedule
    const paymentSchedule = generatePaymentSchedule(
      config.paymentSchedule.startMonth,
      config.paymentSchedule.endMonth,
      config.paymentSchedule.totalMonths,
      monthlyAmount,
      targetYear
    );
    
    // Create student payment record
    const studentPayment = new StudentPayment({
      student: studentId,
      school: schoolId,
      academicYear: targetYear,
      classGroup: classGroup,
      studentClass: classGrade, // Store the grade, not the class name
      monthlyPayments: paymentSchedule,
      totalAmount: totalAmount,
      paidAmount: 0,
      remainingAmount: totalAmount,
      createdBy: userId
    });
    
    await studentPayment.save();
    
    res.status(201).json({
      message: 'Payment schedule generated successfully',
      paymentRecord: studentPayment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Record Monthly Payment
const recordMonthlyPayment = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      monthIndex, 
      amount, 
      paymentMethod, 
      paymentDate, 
      notes, 
      receiptNumber 
    } = req.body;
    const userId = req.userId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Find payment record
    const paymentRecord = await StudentPayment.findOne({
      student: studentId,
      academicYear: targetYear
    });
    
    if (!paymentRecord) {
      return res.status(404).json({ 
        message: 'Payment record not found. Please generate payment schedule first.' 
      });
    }
    
    // Get the specific monthly payment
    const monthlyPayment = paymentRecord.monthlyPayments[monthIndex];
    if (!monthlyPayment) {
      return res.status(404).json({ message: 'Monthly payment not found' });
    }
    
    // Update monthly payment
    const paidAmount = parseFloat(amount);
    monthlyPayment.paidAmount += paidAmount;
    monthlyPayment.paymentDate = paymentDate || new Date();
    monthlyPayment.paymentMethod = paymentMethod || 'cash';
    monthlyPayment.receiptNumber = receiptNumber;
    monthlyPayment.notes = notes;
    monthlyPayment.recordedBy = userId;
    
    // Update status based on amount paid
    if (monthlyPayment.paidAmount >= monthlyPayment.amount) {
      monthlyPayment.status = 'paid';
    } else if (monthlyPayment.paidAmount > 0) {
      monthlyPayment.status = 'partial';
    }
    
    // Update total paid amount
    paymentRecord.paidAmount += paidAmount;
    paymentRecord.calculateRemainingAmount();
    paymentRecord.updateOverallStatus();
    
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Record Annual Payment
const recordAnnualPayment = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      paymentMethod, 
      paymentDate, 
      notes, 
      receiptNumber, 
      discount 
    } = req.body;
    const userId = req.userId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    const paymentRecord = await StudentPayment.findOne({
      student: studentId,
      academicYear: targetYear
    });
    
    if (!paymentRecord) {
      return res.status(404).json({ 
        message: 'Payment record not found. Please generate payment schedule first.' 
      });
    }
    
    if (paymentRecord.annualPayment.isPaid) {
      return res.status(400).json({ message: 'Annual payment already recorded' });
    }
    
    // Calculate discounted amount
    const discountAmount = discount || 0;
    const finalAmount = paymentRecord.totalAmount - discountAmount;
    
    // Update annual payment
    paymentRecord.annualPayment = {
      isPaid: true,
      paymentDate: paymentDate || new Date(),
      paymentMethod: paymentMethod || 'cash',
      receiptNumber: receiptNumber,
      discount: discountAmount,
      notes: notes,
      recordedBy: userId
    };
    
    // Update payment type and amounts
    paymentRecord.paymentType = 'annual';
    paymentRecord.paidAmount = finalAmount;
    paymentRecord.calculateRemainingAmount();
    
    // Mark all monthly payments as paid
    paymentRecord.monthlyPayments.forEach(payment => {
      payment.status = 'paid';
      payment.paidAmount = payment.amount;
      payment.paymentDate = paymentDate || new Date();
      payment.paymentMethod = paymentMethod || 'cash';
      payment.recordedBy = userId;
    });
    
    paymentRecord.updateOverallStatus();
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Annual payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk Generate Payments for All Students Without Payment Records
const bulkGeneratePayments = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { academicYear } = req.body;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Get payment configuration
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    });
    
    if (!config) {
      return res.status(404).json({ 
        message: 'Payment configuration not found. Please set up payment configuration first.' 
      });
    }
    
    // Get all students in the school who don't have payment records
    const studentsWithoutPayments = await User.aggregate([
      { $match: { school: schoolId, role: 'student' } },
      { 
        $lookup: {
          from: 'studentpayments',
          let: { studentId: '$_id' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $and: [
                    { $eq: ['$student', '$$studentId'] },
                    { $eq: ['$academicYear', targetYear] }
                  ]
                }
              }
            }
          ],
          as: 'payments'
        }
      },
      { $match: { payments: { $size: 0 } } },
      { 
        $lookup: {
          from: 'classes',
          localField: 'studentClass',
          foreignField: '_id',
          as: 'classInfo'
        }
      }
    ]);
    
    const results = {
      success: 0,
      skipped: 0,
      errors: []
    };
    
    for (const student of studentsWithoutPayments) {
      try {
        // Skip students without class assignment
        if (!student.classInfo || student.classInfo.length === 0) {
          results.errors.push({
            studentId: student._id,
            studentName: student.name,
            error: 'Student not assigned to any class'
          });
          continue;
        }
        
        const classGrade = student.classInfo[0].grade; // Use grade field instead of name
        const classGroup = getClassGroup(classGrade);
        const totalAmount = config.paymentAmounts[classGroup];
        const monthlyAmount = totalAmount / config.paymentSchedule.totalMonths;
        
        // Generate payment schedule
        const paymentSchedule = generatePaymentSchedule(
          config.paymentSchedule.startMonth,
          config.paymentSchedule.endMonth,
          config.paymentSchedule.totalMonths,
          monthlyAmount,
          targetYear
        );
        
        // Create student payment record
        const studentPayment = new StudentPayment({
          student: student._id,
          school: schoolId,
          academicYear: targetYear,
          classGroup: classGroup,
          studentClass: classGrade, // Store the grade, not the class name
          monthlyPayments: paymentSchedule,
          totalAmount: totalAmount,
          paidAmount: 0,
          remainingAmount: totalAmount,
          createdBy: userId
        });
        
        await studentPayment.save();
        results.success++;
        
      } catch (error) {
        results.errors.push({
          studentId: student._id,
          studentName: student.name,
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      message: 'Bulk payment generation completed',
      results: results
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Payment Dashboard Statistics
const getPaymentDashboard = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Get total students count
    const totalStudents = await User.countDocuments({ 
      school: schoolId, 
      role: 'student' 
    });
    
    // Get payment records
    const allPayments = await StudentPayment.find({ 
      school: schoolId, 
      academicYear: targetYear 
    });
    
    // Students with payment records
    const studentsWithPayments = allPayments.length;
    const studentsWithoutPayments = totalStudents - studentsWithPayments;
    
    // Calculate statistics
    const totalRevenue = allPayments.reduce((sum, payment) => sum + payment.paidAmount, 0);
    const expectedRevenue = allPayments.reduce((sum, payment) => sum + payment.totalAmount, 0);
    const outstandingAmount = expectedRevenue - totalRevenue;
    
    // Status counts
    const statusCounts = {
      pending: allPayments.filter(p => p.overallStatus === 'pending').length,
      partial: allPayments.filter(p => p.overallStatus === 'partial').length,
      completed: allPayments.filter(p => p.overallStatus === 'completed').length,
      overdue: allPayments.filter(p => p.overallStatus === 'overdue').length,
      no_record: studentsWithoutPayments
    };
    
    // Class group statistics
    const classGroupStats = {
      école: {
        count: allPayments.filter(p => p.classGroup === 'école').length,
        revenue: allPayments.filter(p => p.classGroup === 'école').reduce((sum, p) => sum + p.paidAmount, 0)
      },
      college: {
        count: allPayments.filter(p => p.classGroup === 'college').length,
        revenue: allPayments.filter(p => p.classGroup === 'college').reduce((sum, p) => sum + p.paidAmount, 0)
      },
      lycée: {
        count: allPayments.filter(p => p.classGroup === 'lycée').length,
        revenue: allPayments.filter(p => p.classGroup === 'lycée').reduce((sum, p) => sum + p.paidAmount, 0)
      }
    };
    
    res.status(200).json({
      dashboard: {
        overview: {
          totalStudents,
          studentsWithPayments,
          studentsWithoutPayments,
          totalRevenue,
          expectedRevenue,
          outstandingAmount,
          collectionRate: expectedRevenue > 0 ? ((totalRevenue / expectedRevenue) * 100).toFixed(2) : 0
        },
        statusCounts,
        classGroupStats
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update Existing Payment Records
const updateExistingPaymentRecords = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { academicYear, updateUnpaidOnly = true } = req.body;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Get current active configuration
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    });
    
    if (!config) {
      return res.status(404).json({ 
        message: 'Active payment configuration not found' 
      });
    }
    
    // Build filter for payment records to update
    let filter = {
      school: schoolId,
      academicYear: targetYear
    };
    
    // If updateUnpaidOnly is true, only update records that haven't been fully paid
    if (updateUnpaidOnly) {
      filter.$or = [
        { 'annualPayment.isPaid': false },
        { 'annualPayment.isPaid': { $exists: false } },
        { overallStatus: { $ne: 'completed' } }
      ];
    }
    
    const existingPayments = await StudentPayment.find(filter);
    
    const results = {
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    for (const payment of existingPayments) {
      try {
        // Skip if annual payment is already made and updateUnpaidOnly is true
        if (updateUnpaidOnly && payment.annualPayment.isPaid) {
          results.skipped++;
          continue;
        }
        
        // Get new amount for this class group
        const newTotalAmount = config.paymentAmounts[payment.classGroup];
        const newMonthlyAmount = newTotalAmount / config.paymentSchedule.totalMonths;
        
        // Store old amounts for comparison
        const oldTotalAmount = payment.totalAmount;
        const oldPaidAmount = payment.paidAmount;
        
        // Update total amount
        payment.totalAmount = newTotalAmount;
        
        // Update monthly payment amounts (only for unpaid months if updateUnpaidOnly)
        payment.monthlyPayments.forEach(monthlyPayment => {
          if (updateUnpaidOnly) {
            // Only update if not fully paid
            if (monthlyPayment.status === 'pending' || 
                (monthlyPayment.status === 'partial' && monthlyPayment.paidAmount < monthlyPayment.amount)) {
              monthlyPayment.amount = newMonthlyAmount;
            }
          } else {
            // Update all monthly amounts
            monthlyPayment.amount = newMonthlyAmount;
          }
        });
        
        // Recalculate remaining amount
        payment.calculateRemainingAmount();
        
        // Update overall status
        payment.updateOverallStatus();
        
        await payment.save();
        results.updated++;
        
      } catch (error) {
        results.errors.push({
          studentId: payment.student,
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      message: 'Payment records update completed',
      results: results,
      configurationUsed: {
        academicYear: targetYear,
        paymentAmounts: config.paymentAmounts
      }
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Individual Student Payment Details
const getStudentPaymentDetails = async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = req.schoolId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Get student information
    const student = await User.findById(studentId)
      .populate('studentClass', 'name grade')
      .select('name email studentClass');
    
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Check if student belongs to this school
    if (student.school.toString() !== schoolId.toString()) {
      return res.status(403).json({ message: 'Student does not belong to your school' });
    }
    
    // Get payment record
    const paymentRecord = await StudentPayment.findOne({
      student: studentId,
      academicYear: targetYear
    }).populate('createdBy', 'name email');
    
    if (!paymentRecord) {
      return res.status(404).json({ 
        message: 'Payment record not found for this student and academic year' 
      });
    }
    
    // Update payment statuses based on current date
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    });
    
    if (config) {
      paymentRecord.updatePaymentStatuses(config.gracePeriod);
      await paymentRecord.save();
    }
    
    res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentClass: student.studentClass,
        classGroup: paymentRecord.classGroup
      },
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Payment Reports
const getPaymentReports = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { 
      academicYear, 
      reportType = 'summary', 
      classGroup, 
      startDate, 
      endDate 
    } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    let filter = {
      school: schoolId,
      academicYear: targetYear
    };
    
    // Add class group filter if specified
    if (classGroup) {
      filter.classGroup = classGroup;
    }
    
    const allPayments = await StudentPayment.find(filter)
      .populate('student', 'name email')
      .populate('createdBy', 'name');
    
    let report = {};
    
    switch (reportType) {
      case 'summary':
        report = generateSummaryReport(allPayments);
        break;
        
      case 'detailed':
        report = generateDetailedReport(allPayments, startDate, endDate);
        break;
        
      case 'overdue':
        report = generateOverdueReport(allPayments);
        break;
        
      case 'collection':
        report = generateCollectionReport(allPayments, startDate, endDate);
        break;
        
      default:
        report = generateSummaryReport(allPayments);
    }
    
    res.status(200).json({
      reportType,
      academicYear: targetYear,
      classGroup: classGroup || 'all',
      dateRange: { startDate, endDate },
      report
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper function to generate summary report
const generateSummaryReport = (payments) => {
  const totalStudents = payments.length;
  const totalExpected = payments.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalCollected = payments.reduce((sum, p) => sum + p.paidAmount, 0);
  const totalOutstanding = totalExpected - totalCollected;
  
  const statusBreakdown = {
    completed: payments.filter(p => p.overallStatus === 'completed').length,
    partial: payments.filter(p => p.overallStatus === 'partial').length,
    pending: payments.filter(p => p.overallStatus === 'pending').length,
    overdue: payments.filter(p => p.overallStatus === 'overdue').length
  };
  
  const classGroupBreakdown = {
    école: {
      count: payments.filter(p => p.classGroup === 'école').length,
      collected: payments.filter(p => p.classGroup === 'école').reduce((sum, p) => sum + p.paidAmount, 0),
      expected: payments.filter(p => p.classGroup === 'école').reduce((sum, p) => sum + p.totalAmount, 0)
    },
    college: {
      count: payments.filter(p => p.classGroup === 'college').length,
      collected: payments.filter(p => p.classGroup === 'college').reduce((sum, p) => sum + p.paidAmount, 0),
      expected: payments.filter(p => p.classGroup === 'college').reduce((sum, p) => sum + p.totalAmount, 0)
    },
    lycée: {
      count: payments.filter(p => p.classGroup === 'lycée').length,
      collected: payments.filter(p => p.classGroup === 'lycée').reduce((sum, p) => sum + p.paidAmount, 0),
      expected: payments.filter(p => p.classGroup === 'lycée').reduce((sum, p) => sum + p.totalAmount, 0)
    }
  };
  
  return {
    overview: {
      totalStudents,
      totalExpected,
      totalCollected,
      totalOutstanding,
      collectionRate: totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(2) : 0
    },
    statusBreakdown,
    classGroupBreakdown
  };
};

// Helper function to generate detailed report
const generateDetailedReport = (payments, startDate, endDate) => {
  let filteredPayments = payments;
  
  // Filter by date range if provided
  if (startDate || endDate) {
    filteredPayments = payments.filter(payment => {
      return payment.monthlyPayments.some(monthly => {
        if (!monthly.paymentDate) return false;
        
        const paymentDate = new Date(monthly.paymentDate);
        const start = startDate ? new Date(startDate) : new Date('1900-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        
        return paymentDate >= start && paymentDate <= end;
      });
    });
  }
  
  return {
    totalRecords: filteredPayments.length,
    payments: filteredPayments.map(payment => ({
      student: payment.student,
      classGroup: payment.classGroup,
      studentClass: payment.studentClass,
      totalAmount: payment.totalAmount,
      paidAmount: payment.paidAmount,
      remainingAmount: payment.remainingAmount,
      overallStatus: payment.overallStatus,
      paymentType: payment.paymentType,
      lastPaymentDate: payment.monthlyPayments
        .filter(m => m.paymentDate)
        .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0]?.paymentDate,
      createdBy: payment.createdBy
    }))
  };
};

// Helper function to generate overdue report
const generateOverdueReport = (payments) => {
  const currentDate = new Date();
  
  const overduePayments = payments.filter(payment => {
    return payment.monthlyPayments.some(monthly => 
      monthly.status === 'overdue' || 
      (monthly.status === 'pending' && new Date(monthly.dueDate) < currentDate)
    );
  });
  
  return {
    totalOverdue: overduePayments.length,
    totalOverdueAmount: overduePayments.reduce((sum, p) => sum + p.remainingAmount, 0),
    payments: overduePayments.map(payment => ({
      student: payment.student,
      classGroup: payment.classGroup,
      studentClass: payment.studentClass,
      remainingAmount: payment.remainingAmount,
      overdueMonths: payment.monthlyPayments.filter(m => 
        m.status === 'overdue' || 
        (m.status === 'pending' && new Date(m.dueDate) < currentDate)
      ).length,
      oldestOverdueDate: payment.monthlyPayments
        .filter(m => m.status === 'overdue' || (m.status === 'pending' && new Date(m.dueDate) < currentDate))
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate
    }))
  };
};

// Helper function to generate collection report
const generateCollectionReport = (payments, startDate, endDate) => {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  
  let totalCollected = 0;
  let collectionsByMonth = {};
  let collectionsByMethod = {};
  
  payments.forEach(payment => {
    // Check monthly payments
    payment.monthlyPayments.forEach(monthly => {
      if (monthly.paymentDate && monthly.paidAmount > 0) {
        const paymentDate = new Date(monthly.paymentDate);
        if (paymentDate >= start && paymentDate <= end) {
          totalCollected += monthly.paidAmount;
          
          const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
          collectionsByMonth[monthKey] = (collectionsByMonth[monthKey] || 0) + monthly.paidAmount;
          
          const method = monthly.paymentMethod || 'cash';
          collectionsByMethod[method] = (collectionsByMethod[method] || 0) + monthly.paidAmount;
        }
      }
    });
    
    // Check annual payments
    if (payment.annualPayment.isPaid && payment.annualPayment.paymentDate) {
      const paymentDate = new Date(payment.annualPayment.paymentDate);
      if (paymentDate >= start && paymentDate <= end) {
        const annualAmount = payment.totalAmount - (payment.annualPayment.discount || 0);
        totalCollected += annualAmount;
        
        const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
        collectionsByMonth[monthKey] = (collectionsByMonth[monthKey] || 0) + annualAmount;
        
        const method = payment.annualPayment.paymentMethod || 'cash';
        collectionsByMethod[method] = (collectionsByMethod[method] || 0) + annualAmount;
      }
    }
  });
  
  return {
    dateRange: { startDate: start, endDate: end },
    totalCollected,
    collectionsByMonth,
    collectionsByMethod,
    averageMonthlyCollection: Object.keys(collectionsByMonth).length > 0 
      ? (totalCollected / Object.keys(collectionsByMonth).length).toFixed(2) 
      : 0
  };
};

// Delete Payment Record
const deletePaymentRecord = async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = req.schoolId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Find and delete payment record
    const paymentRecord = await StudentPayment.findOneAndDelete({
      student: studentId,
      school: schoolId,
      academicYear: targetYear
    });
    
    if (!paymentRecord) {
      return res.status(404).json({ 
        message: 'Payment record not found' 
      });
    }
    
    res.status(200).json({
      message: 'Payment record deleted successfully',
      deletedRecord: {
        studentId: paymentRecord.student,
        academicYear: paymentRecord.academicYear,
        totalAmount: paymentRecord.totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Payment Statistics by Month
const getPaymentStatsByMonth = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    const allPayments = await StudentPayment.find({
      school: schoolId,
      academicYear: targetYear
    });
    
    const monthlyStats = {};
    
    // Initialize months
    for (let i = 1; i <= 12; i++) {
      monthlyStats[i] = {
        month: i,
        monthName: getMonthName(i),
        expected: 0,
        collected: 0,
        pending: 0,
        overdue: 0,
        collectionRate: 0
      };
    }
    
    // Calculate statistics for each month
    allPayments.forEach(payment => {
      payment.monthlyPayments.forEach(monthly => {
        const month = monthly.month;
        const stats = monthlyStats[month];
        
        stats.expected += monthly.amount;
        stats.collected += monthly.paidAmount;
        
        if (monthly.status === 'pending') {
          stats.pending += (monthly.amount - monthly.paidAmount);
        } else if (monthly.status === 'overdue') {
          stats.overdue += (monthly.amount - monthly.paidAmount);
        }
      });
    });
    
    // Calculate collection rates
    Object.values(monthlyStats).forEach(stats => {
      if (stats.expected > 0) {
        stats.collectionRate = ((stats.collected / stats.expected) * 100).toFixed(2);
      }
    });
    
    res.status(200).json({
      academicYear: targetYear,
      monthlyStats: Object.values(monthlyStats)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Export Payment Data to CSV format
const exportPaymentData = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear, classGroup, paymentStatus } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    let filter = {
      school: schoolId,
      academicYear: targetYear
    };
    
    if (classGroup) {
      filter.classGroup = classGroup;
    }
    
    if (paymentStatus) {
      filter.overallStatus = paymentStatus;
    }
    
    const payments = await StudentPayment.find(filter)
      .populate('student', 'name email')
      .populate('createdBy', 'name');
    
    // Prepare CSV data
    const csvData = payments.map(payment => ({
      'Student Name': payment.student.name,
      'Student Email': payment.student.email,
      'Class Group': payment.classGroup,
      'Student Class': payment.studentClass,
      'Total Amount': payment.totalAmount,
      'Paid Amount': payment.paidAmount,
      'Remaining Amount': payment.remainingAmount,
      'Overall Status': payment.overallStatus,
      'Payment Type': payment.paymentType,
      'Academic Year': payment.academicYear,
      'Created Date': payment.createdAt?.toLocaleDateString(),
      'Created By': payment.createdBy?.name || 'Unknown'
    }));
    
    res.status(200).json({
      message: 'Payment data exported successfully',
      totalRecords: csvData.length,
      data: csvData
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


const deleteAllPaymentRecords = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { academicYear } = req.body;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    console.log(`Starting bulk deletion for academic year: ${targetYear}, school: ${schoolId}`);
    
    // Find all payment records for the academic year and school
    const paymentRecords = await StudentPayment.find({ 
      school: schoolId,
      academicYear: targetYear 
    }).populate('student', 'name email');
    
    if (paymentRecords.length === 0) {
      return res.status(404).json({
        message: 'No payment records found for the specified academic year',
        results: {
          deleted: 0,
          errors: []
        }
      });
    }
    
    const results = {
      deleted: 0,
      errors: []
    };
    
    // Delete each payment record
    for (const record of paymentRecords) {
      try {
        await StudentPayment.findByIdAndDelete(record._id);
        results.deleted++;
        
        console.log(`Deleted payment record for student: ${record.student?.name || 'Unknown'} (ID: ${record.student?._id})`);
      } catch (error) {
        console.error(`Failed to delete payment record for student ID: ${record.student?._id}`, error);
        results.errors.push({
          studentId: record.student?._id || record._id,
          error: `Failed to delete payment record: ${error.message}`
        });
      }
    }
    
    // Log the bulk deletion for audit purposes
    console.log(`Bulk deletion completed for academic year ${targetYear}:`, {
      deleted: results.deleted,
      errors: results.errors.length,
      timestamp: new Date().toISOString(),
      userId: userId,
      schoolId: schoolId
    });
    
    // Send success response
    res.status(200).json({
      message: `Bulk deletion completed for academic year ${targetYear}. ${results.deleted} record(s) deleted successfully.`,
      results: results
    });

  } catch (error) {
    console.error('Error in bulk delete payment records:', error);
    res.status(500).json({
      message: 'Server error during bulk deletion',
      error: error.message,
      results: {
        deleted: 0,
        errors: [{
          studentId: 'system',
          error: `Server error: ${error.message}`
        }]
      }
    });
  }
};

module.exports = {
  createOrUpdatePaymentConfig,
  getPaymentConfig,
  getAllStudentsWithPayments,     // Main function for admin page
  generatePaymentForStudent,      // Generate payment for single student
  recordMonthlyPayment,           // Record monthly payment
  recordAnnualPayment,            // Record annual payment
  bulkGeneratePayments,           // Generate for all students
  getPaymentDashboard,            // Dashboard statistics
  updateExistingPaymentRecords,   // Update existing records
  getStudentPaymentDetails,       // Get individual student payment details
  getPaymentReports,              // Generate various payment reports
  deletePaymentRecord,            // Delete payment record
  getPaymentStatsByMonth,         // Get monthly statistics
  exportPaymentData      , 
  deleteAllPaymentRecords         // Export payment data
};