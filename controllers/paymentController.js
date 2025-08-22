// Complete Updated Payment Controller with Grade-specific pricing, Uniform, and Transportation

const PaymentConfiguration = require('../models/PaymentConfiguration');
const StudentPayment = require('../models/StudentPayment');
const User = require('../models/User');

// ✅ UPDATED: Helper function to determine grade category
const getGradeCategory = (grade) => {
  const maternelleGrades = ['Maternal']; // ✅ UPDATED
  const primaireGrades = ['1ère année primaire', '2ème année primaire', '3ème année primaire', '4ème année primaire', '5ème année primaire', '6ème année primaire'];
  const secondaireGrades = ['7ème année', '8ème année', '9ème année', '1ère année lycée', '2ème année lycée', '3ème année lycée', '4ème année lycée'];
  
  if (maternelleGrades.includes(grade)) return 'maternelle';
  if (primaireGrades.includes(grade)) return 'primaire';
  if (secondaireGrades.includes(grade)) return 'secondaire';
  
  return 'unknown';
};
// Helper function to get month names
const getMonthName = (monthNumber) => {
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return months[monthNumber - 1];
};

// ✅ NEW: Helper function to generate tuition payment schedule
const generateTuitionPaymentSchedule = (startMonth, endMonth, totalMonths, monthlyAmount, academicYear) => {
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

// ✅ NEW: Helper function to generate transportation payment schedule
const generateTransportationPaymentSchedule = (startMonth, endMonth, totalMonths, monthlyAmount, academicYear) => {
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
    
    // Set due date to the 5th of each month for transportation
    const dueDate = new Date(year, month - 1, 5);
    
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

// ✅ UPDATED: Create or Update Payment Configuration
const createOrUpdatePaymentConfig = async (req, res) => {
  try {
    const { 
      academicYear,
      gradeAmounts,        // ✅ NEW: Individual grade pricing
      uniform,             // ✅ NEW: Uniform configuration
      transportation,      // ✅ NEW: Transportation configuration
      paymentSchedule,
      gracePeriod,
      annualPaymentDiscount 
    } = req.body;
    
    const schoolId = req.schoolId;
    const userId = req.userId;
    
    // Use the academic year from request, or fallback to current year
    const targetYear = academicYear || (() => {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      return `${currentYear}-${currentYear + 1}`;
    })();
    
    console.log('Backend: Creating/updating config for year:', targetYear);
    
    // Check if configuration already exists for this specific academic year
    let config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear
    });
    
    if (config) {
      console.log('Backend: Updating existing config');
      // Update existing configuration
      config.gradeAmounts = gradeAmounts;
      config.uniform = uniform;
      config.transportation = transportation;
      config.paymentSchedule = paymentSchedule;
      if (gracePeriod !== undefined) config.gracePeriod = gracePeriod;
      if (annualPaymentDiscount !== undefined) config.annualPaymentDiscount = annualPaymentDiscount;
      config.updatedBy = userId;
      config.updatedAt = new Date();
    } else {
      console.log('Backend: Creating new config');
      // Create new configuration
      config = new PaymentConfiguration({
        school: schoolId,
        academicYear: targetYear,
        gradeAmounts: gradeAmounts,
        uniform: uniform || {
          enabled: false,
          price: 0,
          description: 'Uniforme scolaire complet',
          isOptional: true
        },
        transportation: transportation || {
          enabled: false,
          tariffs: {
            close: { enabled: false, monthlyPrice: 0, description: 'Transport scolaire - Zone proche' },
            far: { enabled: false, monthlyPrice: 0, description: 'Transport scolaire - Zone éloignée' }
          },
          isOptional: true
        },
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
    
    console.log('Backend: Config saved successfully:', config.academicYear);
    
    res.status(200).json({
      message: 'Payment configuration saved successfully',
      config: config
    });
  } catch (error) {
    console.error('Backend error:', error);
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

// ✅ UPDATED: Get All Students with Payment Status
const getAllStudentsWithPayments = async (req, res) => {
  try {
    const { 
      search, 
      paymentStatus, 
      gradeCategory,    // ✅ NEW: Filter by grade category
      grade,           // ✅ NEW: Filter by specific grade
      classId,
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
    
    // Add class filter
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
      const studentGrade = student.studentClass?.grade;
      const gradeCategoryValue = studentGrade ? getGradeCategory(studentGrade) : null;
      
      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentClass: student.studentClass,
        grade: studentGrade,
        gradeCategory: gradeCategoryValue,
        paymentRecord: payment ? {
          _id: payment._id,
          totalAmounts: payment.totalAmounts,
          paidAmounts: payment.paidAmounts,
          remainingAmounts: payment.remainingAmounts,
          overallStatus: payment.overallStatus,
          componentStatus: payment.componentStatus,
          paymentType: payment.paymentType,
          tuitionMonthlyPayments: payment.tuitionMonthlyPayments,
          uniform: payment.uniform,
          transportation: payment.transportation,
          academicYear: payment.academicYear
        } : null,
        hasPaymentRecord: !!payment
      };
    });
    
    // Apply filters
    if (gradeCategory) {
      studentsWithPayments = studentsWithPayments.filter(s => s.gradeCategory === gradeCategory);
    }
    
    if (grade) {
      studentsWithPayments = studentsWithPayments.filter(s => s.grade === grade);
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

// ✅ UPDATED: Generate Payment Record for Existing Student
const generatePaymentForStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { 
      academicYear,
      hasUniform = false,        // ✅ NEW: Whether student wants uniform
      transportationType = null  // ✅ NEW: 'close', 'far', or null
    } = req.body;
    
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
    
    // Get student grade
    const studentGrade = student.studentClass?.grade;
    if (!studentGrade) {
      return res.status(400).json({ 
        message: 'Student is not assigned to any class. Please assign student to a class first.' 
      });
    } 
    
    // Get grade category
    const gradeCategory = getGradeCategory(studentGrade);
    
    // Calculate amounts
    const tuitionAmount = config.getAmountForGrade(studentGrade);
    const monthlyTuitionAmount = tuitionAmount / config.paymentSchedule.totalMonths;
    
    let uniformAmount = 0;
    if (hasUniform && config.uniform.enabled) {
      uniformAmount = config.uniform.price;
    }
    
    let transportationAmount = 0;
    let monthlyTransportAmount = 0;
    if (transportationType && config.transportation.enabled) {
      if (transportationType === 'close' && config.transportation.tariffs.close.enabled) {
        monthlyTransportAmount = config.transportation.tariffs.close.monthlyPrice;
      } else if (transportationType === 'far' && config.transportation.tariffs.far.enabled) {
        monthlyTransportAmount = config.transportation.tariffs.far.monthlyPrice;
      }
      transportationAmount = monthlyTransportAmount * config.paymentSchedule.totalMonths;
    }
    
    // Generate payment schedules
    const tuitionSchedule = generateTuitionPaymentSchedule(
      config.paymentSchedule.startMonth,
      config.paymentSchedule.endMonth,
      config.paymentSchedule.totalMonths,
      monthlyTuitionAmount,
      targetYear
    );
    
    let transportationSchedule = [];
    if (transportationType) {
      transportationSchedule = generateTransportationPaymentSchedule(
        config.paymentSchedule.startMonth,
        config.paymentSchedule.endMonth,
        config.paymentSchedule.totalMonths,
        monthlyTransportAmount,
        targetYear
      );
    }
    
    // Create student payment record
    const studentPayment = new StudentPayment({
      student: studentId,
      school: schoolId,
      academicYear: targetYear,
      grade: studentGrade,
      gradeCategory: gradeCategory,
      studentClass: student.studentClass.name,
      
      tuitionFees: {
        amount: tuitionAmount,
        monthlyAmount: monthlyTuitionAmount
      },
      
      uniform: {
        purchased: hasUniform,
        price: uniformAmount,
        isPaid: false
      },
      
      transportation: {
        using: !!transportationType,
        type: transportationType,
        monthlyPrice: monthlyTransportAmount,
        totalAmount: transportationAmount,
        monthlyPayments: transportationSchedule
      },
      
      tuitionMonthlyPayments: tuitionSchedule,
      
      totalAmounts: {
        tuition: tuitionAmount,
        uniform: uniformAmount,
        transportation: transportationAmount,
        grandTotal: tuitionAmount + uniformAmount + transportationAmount
      },
      
      paidAmounts: {
        tuition: 0,
        uniform: 0,
        transportation: 0,
        grandTotal: 0
      },
      
      componentStatus: {
        tuition: 'pending',
        uniform: hasUniform ? 'pending' : 'not_applicable',
        transportation: transportationType ? 'pending' : 'not_applicable'
      },
      
      createdBy: userId
    });
    
    // Calculate remaining amounts
    studentPayment.calculateRemainingAmounts();
    
    await studentPayment.save();
    
    res.status(201).json({
      message: 'Payment schedule generated successfully',
      paymentRecord: studentPayment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ NEW: Record Uniform Payment
const recordUniformPayment = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
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
    
    if (!paymentRecord.uniform.purchased) {
      return res.status(400).json({ message: 'Student has not opted for uniform purchase' });
    }
    
    if (paymentRecord.uniform.isPaid) {
      return res.status(400).json({ message: 'Uniform payment already recorded' });
    }
    
    // Update uniform payment
    paymentRecord.uniform.isPaid = true;
    paymentRecord.uniform.paymentDate = paymentDate || new Date();
    paymentRecord.uniform.paymentMethod = paymentMethod || 'cash';
    paymentRecord.uniform.receiptNumber = receiptNumber;
    paymentRecord.uniform.notes = notes;
    paymentRecord.uniform.recordedBy = userId;
    
    // Update paid amounts
    paymentRecord.paidAmounts.uniform = paymentRecord.uniform.price;
    paymentRecord.paidAmounts.grandTotal += paymentRecord.uniform.price;
    
    // Calculate remaining amounts and update status
    paymentRecord.calculateRemainingAmounts();
    paymentRecord.updateOverallStatus();
    
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Uniform payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Record Monthly Tuition Payment
const recordMonthlyTuitionPayment = async (req, res) => {
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
    const monthlyPayment = paymentRecord.tuitionMonthlyPayments[monthIndex];
    if (!monthlyPayment) {
      return res.status(404).json({ message: 'Monthly payment not found' });
    }
    
    // Update monthly payment
    const paidAmount = parseFloat(amount);
    const previousPaidAmount = monthlyPayment.paidAmount;
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
    paymentRecord.paidAmounts.tuition += paidAmount;
    paymentRecord.paidAmounts.grandTotal += paidAmount;
    
    // Calculate remaining amounts and update status
    paymentRecord.calculateRemainingAmounts();
    paymentRecord.updateOverallStatus();
    
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Tuition payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ NEW: Record Monthly Transportation Payment
const recordMonthlyTransportationPayment = async (req, res) => {
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
    
    if (!paymentRecord.transportation.using) {
      return res.status(400).json({ message: 'Student is not using transportation service' });
    }
    
    // Get the specific monthly payment
    const monthlyPayment = paymentRecord.transportation.monthlyPayments[monthIndex];
    if (!monthlyPayment) {
      return res.status(404).json({ message: 'Monthly transportation payment not found' });
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
    paymentRecord.paidAmounts.transportation += paidAmount;
    paymentRecord.paidAmounts.grandTotal += paidAmount;
    
    // Calculate remaining amounts and update status
    paymentRecord.calculateRemainingAmounts();
    paymentRecord.updateOverallStatus();
    
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Transportation payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Record Annual Tuition Payment
const recordAnnualTuitionPayment = async (req, res) => {
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
    
    if (paymentRecord.annualTuitionPayment.isPaid) {
      return res.status(400).json({ message: 'Annual tuition payment already recorded' });
    }
    
    // Calculate discounted amount
    const discountAmount = discount || 0;
    const finalAmount = paymentRecord.tuitionFees.amount - discountAmount;
    
    // Update annual payment
    paymentRecord.annualTuitionPayment = {
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
    
    // Calculate the difference in paid amount
    const previousTuitionPaid = paymentRecord.paidAmounts.tuition;
    paymentRecord.paidAmounts.tuition = finalAmount;
    paymentRecord.paidAmounts.grandTotal = paymentRecord.paidAmounts.grandTotal - previousTuitionPaid + finalAmount;
    
    // Mark all monthly tuition payments as paid
    paymentRecord.tuitionMonthlyPayments.forEach(payment => {
      payment.status = 'paid';
      payment.paidAmount = payment.amount;
      payment.paymentDate = paymentDate || new Date();
      payment.paymentMethod = paymentMethod || 'cash';
      payment.recordedBy = userId;
    });
    
    // Calculate remaining amounts and update status
    paymentRecord.calculateRemainingAmounts();
    paymentRecord.updateOverallStatus();
    
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Annual tuition payment recorded successfully',
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Bulk Generate Payments for All Students Without Payment Records
const bulkGeneratePayments = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { 
      academicYear,
      defaultUniform = false,      // ✅ NEW: Default uniform option for all students
      defaultTransportation = null // ✅ NEW: Default transportation for all students
    } = req.body;
    
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
        
        const studentGrade = student.classInfo[0].grade;
        const gradeCategory = getGradeCategory(studentGrade);
        
        // Calculate amounts
        const tuitionAmount = config.getAmountForGrade(studentGrade);
        const monthlyTuitionAmount = tuitionAmount / config.paymentSchedule.totalMonths;
        
        let uniformAmount = 0;
        if (defaultUniform && config.uniform.enabled) {
          uniformAmount = config.uniform.price;
        }
        
        let transportationAmount = 0;
        let monthlyTransportAmount = 0;
        if (defaultTransportation && config.transportation.enabled) {
          if (defaultTransportation === 'close' && config.transportation.tariffs.close.enabled) {
            monthlyTransportAmount = config.transportation.tariffs.close.monthlyPrice;
          } else if (defaultTransportation === 'far' && config.transportation.tariffs.far.enabled) {
            monthlyTransportAmount = config.transportation.tariffs.far.monthlyPrice;
          }
          transportationAmount = monthlyTransportAmount * config.paymentSchedule.totalMonths;
        }
        
        // Generate payment schedules
        const tuitionSchedule = generateTuitionPaymentSchedule(
          config.paymentSchedule.startMonth,
          config.paymentSchedule.endMonth,
          config.paymentSchedule.totalMonths,
          monthlyTuitionAmount,
          targetYear
        );
        
        let transportationSchedule = [];
        if (defaultTransportation) {
          transportationSchedule = generateTransportationPaymentSchedule(
            config.paymentSchedule.startMonth,
            config.paymentSchedule.endMonth,
            config.paymentSchedule.totalMonths,
            monthlyTransportAmount,
            targetYear
          );
        }
        
        // Create student payment record
        const studentPayment = new StudentPayment({
          student: student._id,
          school: schoolId,
          academicYear: targetYear,
          grade: studentGrade,
          gradeCategory: gradeCategory,
          studentClass: student.classInfo[0].name,
          
          tuitionFees: {
            amount: tuitionAmount,
            monthlyAmount: monthlyTuitionAmount
          },
          
          uniform: {
            purchased: defaultUniform,
            price: uniformAmount,
            isPaid: false
          },
          
          transportation: {
            using: !!defaultTransportation,
            type: defaultTransportation,
            monthlyPrice: monthlyTransportAmount,
            totalAmount: transportationAmount,
            monthlyPayments: transportationSchedule
          },
          
          tuitionMonthlyPayments: tuitionSchedule,
          
          totalAmounts: {
            tuition: tuitionAmount,
            uniform: uniformAmount,
            transportation: transportationAmount,
            grandTotal: tuitionAmount + uniformAmount + transportationAmount
          },
          
          paidAmounts: {
            tuition: 0,
            uniform: 0,
            transportation: 0,
            grandTotal: 0
          },
          
          componentStatus: {
            tuition: 'pending',
            uniform: defaultUniform ? 'pending' : 'not_applicable',
            transportation: defaultTransportation ? 'pending' : 'not_applicable'
          },
          
          createdBy: userId
        });
        
        // Calculate remaining amounts
        studentPayment.calculateRemainingAmounts();
        
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

// ✅ UPDATED: Get Payment Dashboard Statistics
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
    
    // Calculate statistics for each component
    const totalRevenue = {
      tuition: allPayments.reduce((sum, payment) => sum + payment.paidAmounts.tuition, 0),
      uniform: allPayments.reduce((sum, payment) => sum + payment.paidAmounts.uniform, 0),
      transportation: allPayments.reduce((sum, payment) => sum + payment.paidAmounts.transportation, 0),
      grandTotal: allPayments.reduce((sum, payment) => sum + payment.paidAmounts.grandTotal, 0)
    };
    
    const expectedRevenue = {
      tuition: allPayments.reduce((sum, payment) => sum + payment.totalAmounts.tuition, 0),
      uniform: allPayments.reduce((sum, payment) => sum + payment.totalAmounts.uniform, 0),
      transportation: allPayments.reduce((sum, payment) => sum + payment.totalAmounts.transportation, 0),
      grandTotal: allPayments.reduce((sum, payment) => sum + payment.totalAmounts.grandTotal, 0)
    };
    
    const outstandingAmount = {
      tuition: expectedRevenue.tuition - totalRevenue.tuition,
      uniform: expectedRevenue.uniform - totalRevenue.uniform,
      transportation: expectedRevenue.transportation - totalRevenue.transportation,
      grandTotal: expectedRevenue.grandTotal - totalRevenue.grandTotal
    };
    
    // Status counts
    const statusCounts = {
      pending: allPayments.filter(p => p.overallStatus === 'pending').length,
      partial: allPayments.filter(p => p.overallStatus === 'partial').length,
      completed: allPayments.filter(p => p.overallStatus === 'completed').length,
      overdue: allPayments.filter(p => p.overallStatus === 'overdue').length,
      no_record: studentsWithoutPayments
    };
    
    // Grade category statistics
    const gradeCategoryStats = {
      maternelle: {
        count: allPayments.filter(p => p.gradeCategory === 'maternelle').length,
        revenue: allPayments.filter(p => p.gradeCategory === 'maternelle').reduce((sum, p) => sum + p.paidAmounts.grandTotal, 0)
      },
      primaire: {
        count: allPayments.filter(p => p.gradeCategory === 'primaire').length,
        revenue: allPayments.filter(p => p.gradeCategory === 'primaire').reduce((sum, p) => sum + p.paidAmounts.grandTotal, 0)
      },
      secondaire: {
        count: allPayments.filter(p => p.gradeCategory === 'secondaire').length,
        revenue: allPayments.filter(p => p.gradeCategory === 'secondaire').reduce((sum, p) => sum + p.paidAmounts.grandTotal, 0)
      }
    };
    
    // Component usage statistics
    const componentStats = {
      uniform: {
        totalStudents: allPayments.filter(p => p.uniform.purchased).length,
        paidStudents: allPayments.filter(p => p.uniform.purchased && p.uniform.isPaid).length,
        totalRevenue: totalRevenue.uniform,
        expectedRevenue: expectedRevenue.uniform
      },
      transportation: {
        totalStudents: allPayments.filter(p => p.transportation.using).length,
        closeZone: allPayments.filter(p => p.transportation.using && p.transportation.type === 'close').length,
        farZone: allPayments.filter(p => p.transportation.using && p.transportation.type === 'far').length,
        totalRevenue: totalRevenue.transportation,
        expectedRevenue: expectedRevenue.transportation
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
          collectionRate: {
            tuition: expectedRevenue.tuition > 0 ? ((totalRevenue.tuition / expectedRevenue.tuition) * 100).toFixed(2) : 0,
            uniform: expectedRevenue.uniform > 0 ? ((totalRevenue.uniform / expectedRevenue.uniform) * 100).toFixed(2) : 0,
            transportation: expectedRevenue.transportation > 0 ? ((totalRevenue.transportation / expectedRevenue.transportation) * 100).toFixed(2) : 0,
            overall: expectedRevenue.grandTotal > 0 ? ((totalRevenue.grandTotal / expectedRevenue.grandTotal) * 100).toFixed(2) : 0
          }
        },
        statusCounts,
        gradeCategoryStats,
        componentStats
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Update Existing Payment Records
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
        { 'annualTuitionPayment.isPaid': false },
        { 'annualTuitionPayment.isPaid': { $exists: false } },
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
        if (updateUnpaidOnly && payment.annualTuitionPayment.isPaid) {
          results.skipped++;
          continue;
        }
        
        // Get new amount for this grade
        const newTuitionAmount = config.getAmountForGrade(payment.grade);
        const newMonthlyTuitionAmount = newTuitionAmount / config.paymentSchedule.totalMonths;
        
        // Store old amounts for comparison
        const oldTuitionAmount = payment.tuitionFees.amount;
        const oldPaidTuition = payment.paidAmounts.tuition;
        
        // Update tuition amounts
        payment.tuitionFees.amount = newTuitionAmount;
        payment.tuitionFees.monthlyAmount = newMonthlyTuitionAmount;
        payment.totalAmounts.tuition = newTuitionAmount;
        
        // Update monthly tuition payment amounts (only for unpaid months if updateUnpaidOnly)
        payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
          if (updateUnpaidOnly) {
            // Only update if not fully paid
            if (monthlyPayment.status === 'pending' || 
                (monthlyPayment.status === 'partial' && monthlyPayment.paidAmount < monthlyPayment.amount)) {
              monthlyPayment.amount = newMonthlyTuitionAmount;
            }
          } else {
            // Update all monthly amounts
            monthlyPayment.amount = newMonthlyTuitionAmount;
          }
        });
        
        // Update uniform pricing if needed
        if (payment.uniform.purchased && config.uniform.enabled) {
          const oldUniformAmount = payment.uniform.price;
          payment.uniform.price = config.uniform.price;
          payment.totalAmounts.uniform = config.uniform.price;
          
          // Update paid amount if uniform was already paid
          if (payment.uniform.isPaid) {
            payment.paidAmounts.uniform = config.uniform.price;
          }
        }
        
        // Update transportation pricing if needed
        if (payment.transportation.using && config.transportation.enabled) {
          let newMonthlyTransportAmount = 0;
          if (payment.transportation.type === 'close' && config.transportation.tariffs.close.enabled) {
            newMonthlyTransportAmount = config.transportation.tariffs.close.monthlyPrice;
          } else if (payment.transportation.type === 'far' && config.transportation.tariffs.far.enabled) {
            newMonthlyTransportAmount = config.transportation.tariffs.far.monthlyPrice;
          }
          
          const newTransportationAmount = newMonthlyTransportAmount * config.paymentSchedule.totalMonths;
          payment.transportation.monthlyPrice = newMonthlyTransportAmount;
          payment.transportation.totalAmount = newTransportationAmount;
          payment.totalAmounts.transportation = newTransportationAmount;
          
          // Update monthly transportation payment amounts
          payment.transportation.monthlyPayments.forEach(monthlyPayment => {
            if (updateUnpaidOnly) {
              if (monthlyPayment.status === 'pending' || 
                  (monthlyPayment.status === 'partial' && monthlyPayment.paidAmount < monthlyPayment.amount)) {
                monthlyPayment.amount = newMonthlyTransportAmount;
              }
            } else {
              monthlyPayment.amount = newMonthlyTransportAmount;
            }
          });
        }
        
        // Recalculate grand total
        payment.totalAmounts.grandTotal = payment.totalAmounts.tuition + payment.totalAmounts.uniform + payment.totalAmounts.transportation;
        
        // Recalculate remaining amounts
        payment.calculateRemainingAmounts();
        
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
        gradeAmounts: config.gradeAmounts,
        uniform: config.uniform,
        transportation: config.transportation
      }
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Get Individual Student Payment Details
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
        grade: paymentRecord.grade,
        gradeCategory: paymentRecord.gradeCategory
      },
      paymentRecord: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Get Payment Reports
const getPaymentReports = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { 
      academicYear, 
      reportType = 'summary', 
      gradeCategory,     // ✅ UPDATED: Use gradeCategory instead of classGroup
      grade,            // ✅ NEW: Filter by specific grade
      component = 'all', // ✅ NEW: Filter by component (tuition, uniform, transportation, all)
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
    
    // Add grade category filter if specified
    if (gradeCategory) {
      filter.gradeCategory = gradeCategory;
    }
    
    // Add specific grade filter if specified
    if (grade) {
      filter.grade = grade;
    }
    
    const allPayments = await StudentPayment.find(filter)
      .populate('student', 'name email')
      .populate('createdBy', 'name');
    
    let report = {};
    
    switch (reportType) {
      case 'summary':
        report = generateSummaryReport(allPayments, component);
        break;
        
      case 'detailed':
        report = generateDetailedReport(allPayments, startDate, endDate, component);
        break;
        
      case 'overdue':
        report = generateOverdueReport(allPayments, component);
        break;
        
      case 'collection':
        report = generateCollectionReport(allPayments, startDate, endDate, component);
        break;
        
      case 'component':
        report = generateComponentReport(allPayments);
        break;
        
      default:
        report = generateSummaryReport(allPayments, component);
    }
    
    res.status(200).json({
      reportType,
      academicYear: targetYear,
      gradeCategory: gradeCategory || 'all',
      grade: grade || 'all',
      component: component,
      dateRange: { startDate, endDate },
      report
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Helper function to generate summary report
const generateSummaryReport = (payments, component = 'all') => {
  const totalStudents = payments.length;
  
  let totalExpected, totalCollected, totalOutstanding;
  
  if (component === 'tuition') {
    totalExpected = payments.reduce((sum, p) => sum + p.totalAmounts.tuition, 0);
    totalCollected = payments.reduce((sum, p) => sum + p.paidAmounts.tuition, 0);
  } else if (component === 'uniform') {
    totalExpected = payments.reduce((sum, p) => sum + p.totalAmounts.uniform, 0);
    totalCollected = payments.reduce((sum, p) => sum + p.paidAmounts.uniform, 0);
  } else if (component === 'transportation') {
    totalExpected = payments.reduce((sum, p) => sum + p.totalAmounts.transportation, 0);
    totalCollected = payments.reduce((sum, p) => sum + p.paidAmounts.transportation, 0);
  } else {
    totalExpected = payments.reduce((sum, p) => sum + p.totalAmounts.grandTotal, 0);
    totalCollected = payments.reduce((sum, p) => sum + p.paidAmounts.grandTotal, 0);
  }
  
  totalOutstanding = totalExpected - totalCollected;
  
  const statusBreakdown = {
    completed: payments.filter(p => p.overallStatus === 'completed').length,
    partial: payments.filter(p => p.overallStatus === 'partial').length,
    pending: payments.filter(p => p.overallStatus === 'pending').length,
    overdue: payments.filter(p => p.overallStatus === 'overdue').length
  };
  
  const gradeCategoryBreakdown = {
    maternelle: {
      count: payments.filter(p => p.gradeCategory === 'maternelle').length,
      collected: payments.filter(p => p.gradeCategory === 'maternelle').reduce((sum, p) => {
        return sum + (component === 'all' ? p.paidAmounts.grandTotal : 
                     component === 'tuition' ? p.paidAmounts.tuition :
                     component === 'uniform' ? p.paidAmounts.uniform :
                     component === 'transportation' ? p.paidAmounts.transportation : 0);
      }, 0),
      expected: payments.filter(p => p.gradeCategory === 'maternelle').reduce((sum, p) => {
        return sum + (component === 'all' ? p.totalAmounts.grandTotal : 
                     component === 'tuition' ? p.totalAmounts.tuition :
                     component === 'uniform' ? p.totalAmounts.uniform :
                     component === 'transportation' ? p.totalAmounts.transportation : 0);
      }, 0)
    },
    primaire: {
      count: payments.filter(p => p.gradeCategory === 'primaire').length,
      collected: payments.filter(p => p.gradeCategory === 'primaire').reduce((sum, p) => {
        return sum + (component === 'all' ? p.paidAmounts.grandTotal : 
                     component === 'tuition' ? p.paidAmounts.tuition :
                     component === 'uniform' ? p.paidAmounts.uniform :
                     component === 'transportation' ? p.paidAmounts.transportation : 0);
      }, 0),
      expected: payments.filter(p => p.gradeCategory === 'primaire').reduce((sum, p) => {
        return sum + (component === 'all' ? p.totalAmounts.grandTotal : 
                     component === 'tuition' ? p.totalAmounts.tuition :
                     component === 'uniform' ? p.totalAmounts.uniform :
                     component === 'transportation' ? p.totalAmounts.transportation : 0);
      }, 0)
    },
    secondaire: {
      count: payments.filter(p => p.gradeCategory === 'secondaire').length,
      collected: payments.filter(p => p.gradeCategory === 'secondaire').reduce((sum, p) => {
        return sum + (component === 'all' ? p.paidAmounts.grandTotal : 
                     component === 'tuition' ? p.paidAmounts.tuition :
                     component === 'uniform' ? p.paidAmounts.uniform :
                     component === 'transportation' ? p.paidAmounts.transportation : 0);
      }, 0),
      expected: payments.filter(p => p.gradeCategory === 'secondaire').reduce((sum, p) => {
        return sum + (component === 'all' ? p.totalAmounts.grandTotal : 
                     component === 'tuition' ? p.totalAmounts.tuition :
                     component === 'uniform' ? p.totalAmounts.uniform :
                     component === 'transportation' ? p.totalAmounts.transportation : 0);
      }, 0)
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
    gradeCategoryBreakdown
  };
};

// ✅ NEW: Helper function to generate component report
const generateComponentReport = (payments) => {
  const componentBreakdown = {
    tuition: {
      totalStudents: payments.length,
      totalExpected: payments.reduce((sum, p) => sum + p.totalAmounts.tuition, 0),
      totalCollected: payments.reduce((sum, p) => sum + p.paidAmounts.tuition, 0),
      statusCounts: {
        completed: payments.filter(p => p.componentStatus.tuition === 'completed').length,
        partial: payments.filter(p => p.componentStatus.tuition === 'partial').length,
        pending: payments.filter(p => p.componentStatus.tuition === 'pending').length,
        overdue: payments.filter(p => p.componentStatus.tuition === 'overdue').length
      }
    },
    uniform: {
      totalStudents: payments.filter(p => p.uniform.purchased).length,
      notUsingService: payments.filter(p => !p.uniform.purchased).length,
      totalExpected: payments.reduce((sum, p) => sum + p.totalAmounts.uniform, 0),
      totalCollected: payments.reduce((sum, p) => sum + p.paidAmounts.uniform, 0),
      statusCounts: {
        completed: payments.filter(p => p.componentStatus.uniform === 'completed').length,
        pending: payments.filter(p => p.componentStatus.uniform === 'pending').length,
        not_applicable: payments.filter(p => p.componentStatus.uniform === 'not_applicable').length
      }
    },
    transportation: {
      totalStudents: payments.filter(p => p.transportation.using).length,
      notUsingService: payments.filter(p => !p.transportation.using).length,
      closeZone: payments.filter(p => p.transportation.using && p.transportation.type === 'close').length,
      farZone: payments.filter(p => p.transportation.using && p.transportation.type === 'far').length,
      totalExpected: payments.reduce((sum, p) => sum + p.totalAmounts.transportation, 0),
      totalCollected: payments.reduce((sum, p) => sum + p.paidAmounts.transportation, 0),
      statusCounts: {
        completed: payments.filter(p => p.componentStatus.transportation === 'completed').length,
        partial: payments.filter(p => p.componentStatus.transportation === 'partial').length,
        pending: payments.filter(p => p.componentStatus.transportation === 'pending').length,
        overdue: payments.filter(p => p.componentStatus.transportation === 'overdue').length,
        not_applicable: payments.filter(p => p.componentStatus.transportation === 'not_applicable').length
      }
    }
  };
  
  return componentBreakdown;
};

// ✅ UPDATED: Helper function to generate detailed report
const generateDetailedReport = (payments, startDate, endDate, component = 'all') => {
  let filteredPayments = payments;
  
  // Filter by date range if provided
  if (startDate || endDate) {
    filteredPayments = payments.filter(payment => {
      const hasRelevantPayment = payment.tuitionMonthlyPayments.some(monthly => {
        if (!monthly.paymentDate) return false;
        
        const paymentDate = new Date(monthly.paymentDate);
        const start = startDate ? new Date(startDate) : new Date('1900-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        
        return paymentDate >= start && paymentDate <= end;
      });
      
      const hasUniformPayment = payment.uniform.isPaid && payment.uniform.paymentDate && (() => {
        const paymentDate = new Date(payment.uniform.paymentDate);
        const start = startDate ? new Date(startDate) : new Date('1900-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        return paymentDate >= start && paymentDate <= end;
      })();
      
      const hasTransportPayment = payment.transportation.monthlyPayments && payment.transportation.monthlyPayments.some(monthly => {
        if (!monthly.paymentDate) return false;
        
        const paymentDate = new Date(monthly.paymentDate);
        const start = startDate ? new Date(startDate) : new Date('1900-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        
        return paymentDate >= start && paymentDate <= end;
      });
      
      return hasRelevantPayment || hasUniformPayment || hasTransportPayment;
    });
  }
  
  return {
    totalRecords: filteredPayments.length,
    payments: filteredPayments.map(payment => {
      const baseData = {
        student: payment.student,
        grade: payment.grade,
        gradeCategory: payment.gradeCategory,
        studentClass: payment.studentClass,
        overallStatus: payment.overallStatus,
        paymentType: payment.paymentType,
        createdBy: payment.createdBy
      };
      
      if (component === 'tuition') {
        return {
          ...baseData,
          totalAmount: payment.totalAmounts.tuition,
          paidAmount: payment.paidAmounts.tuition,
          remainingAmount: payment.remainingAmounts.tuition,
          componentStatus: payment.componentStatus.tuition,
          lastPaymentDate: payment.tuitionMonthlyPayments
            .filter(m => m.paymentDate)
            .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0]?.paymentDate
        };
      } else if (component === 'uniform') {
        return {
          ...baseData,
          totalAmount: payment.totalAmounts.uniform,
          paidAmount: payment.paidAmounts.uniform,
          remainingAmount: payment.remainingAmounts.uniform,
          componentStatus: payment.componentStatus.uniform,
          purchased: payment.uniform.purchased,
          lastPaymentDate: payment.uniform.paymentDate
        };
      } else if (component === 'transportation') {
        return {
          ...baseData,
          totalAmount: payment.totalAmounts.transportation,
          paidAmount: payment.paidAmounts.transportation,
          remainingAmount: payment.remainingAmounts.transportation,
          componentStatus: payment.componentStatus.transportation,
          using: payment.transportation.using,
          type: payment.transportation.type,
          lastPaymentDate: payment.transportation.monthlyPayments
            .filter(m => m.paymentDate)
            .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0]?.paymentDate
        };
      } else {
        return {
          ...baseData,
          totalAmounts: payment.totalAmounts,
          paidAmounts: payment.paidAmounts,
          remainingAmounts: payment.remainingAmounts,
          componentStatus: payment.componentStatus,
          uniform: payment.uniform,
          transportation: payment.transportation,
          lastPaymentDate: [
            ...payment.tuitionMonthlyPayments.filter(m => m.paymentDate),
            ...(payment.uniform.paymentDate ? [{ paymentDate: payment.uniform.paymentDate }] : []),
            ...(payment.transportation.monthlyPayments ? payment.transportation.monthlyPayments.filter(m => m.paymentDate) : [])
          ].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0]?.paymentDate
        };
      }
    })
  };
};

// ✅ UPDATED: Helper function to generate overdue report
const generateOverdueReport = (payments, component = 'all') => {
  const currentDate = new Date();
  
  let overduePayments;
  
  if (component === 'tuition') {
    overduePayments = payments.filter(payment => 
      payment.componentStatus.tuition === 'overdue' ||
      payment.tuitionMonthlyPayments.some(monthly => 
        monthly.status === 'overdue' || 
        (monthly.status === 'pending' && new Date(monthly.dueDate) < currentDate)
      )
    );
  } else if (component === 'transportation') {
    overduePayments = payments.filter(payment => 
      payment.componentStatus.transportation === 'overdue' ||
      (payment.transportation.using && payment.transportation.monthlyPayments.some(monthly => 
        monthly.status === 'overdue' || 
        (monthly.status === 'pending' && new Date(monthly.dueDate) < currentDate)
      ))
    );
  } else {
    overduePayments = payments.filter(payment => {
      const hasTuitionOverdue = payment.tuitionMonthlyPayments.some(monthly => 
        monthly.status === 'overdue' || 
        (monthly.status === 'pending' && new Date(monthly.dueDate) < currentDate)
      );
      
      const hasTransportOverdue = payment.transportation.using && 
        payment.transportation.monthlyPayments.some(monthly => 
          monthly.status === 'overdue' || 
          (monthly.status === 'pending' && new Date(monthly.dueDate) < currentDate)
        );
      
      return hasTuitionOverdue || hasTransportOverdue;
    });
  }
  
  const totalOverdueAmount = overduePayments.reduce((sum, p) => {
    if (component === 'tuition') return sum + p.remainingAmounts.tuition;
    if (component === 'transportation') return sum + p.remainingAmounts.transportation;
    return sum + p.remainingAmounts.grandTotal;
  }, 0);
  
  return {
    totalOverdue: overduePayments.length,
    totalOverdueAmount,
    payments: overduePayments.map(payment => {
      const overdueMonths = {
        tuition: payment.tuitionMonthlyPayments.filter(m => 
          m.status === 'overdue' || 
          (m.status === 'pending' && new Date(m.dueDate) < currentDate)
        ).length,
        transportation: payment.transportation.using ? 
          payment.transportation.monthlyPayments.filter(m => 
            m.status === 'overdue' || 
            (m.status === 'pending' && new Date(m.dueDate) < currentDate)
          ).length : 0
      };
      
      const oldestOverdueDate = [
        ...payment.tuitionMonthlyPayments.filter(m => 
          m.status === 'overdue' || (m.status === 'pending' && new Date(m.dueDate) < currentDate)
        ),
        ...(payment.transportation.using ? 
          payment.transportation.monthlyPayments.filter(m => 
            m.status === 'overdue' || (m.status === 'pending' && new Date(m.dueDate) < currentDate)
          ) : [])
      ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate;
      
      return {
        student: payment.student,
        grade: payment.grade,
        gradeCategory: payment.gradeCategory,
        studentClass: payment.studentClass,
        remainingAmounts: payment.remainingAmounts,
        componentStatus: payment.componentStatus,
        overdueMonths,
        oldestOverdueDate
      };
    })
  };
};

// ✅ UPDATED: Helper function to generate collection report
const generateCollectionReport = (payments, startDate, endDate, component = 'all') => {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  
  let totalCollected = 0;
  let collectionsByMonth = {};
  let collectionsByMethod = {};
  
  payments.forEach(payment => {
    // Check tuition payments
    if (component === 'all' || component === 'tuition') {
      payment.tuitionMonthlyPayments.forEach(monthly => {
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
      
      // Check annual tuition payments
      if (payment.annualTuitionPayment.isPaid && payment.annualTuitionPayment.paymentDate) {
        const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
        if (paymentDate >= start && paymentDate <= end) {
          const annualAmount = payment.tuitionFees.amount - (payment.annualTuitionPayment.discount || 0);
          totalCollected += annualAmount;
          
          const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
          collectionsByMonth[monthKey] = (collectionsByMonth[monthKey] || 0) + annualAmount;
          
          const method = payment.annualTuitionPayment.paymentMethod || 'cash';
          collectionsByMethod[method] = (collectionsByMethod[method] || 0) + annualAmount;
        }
      }
    }
    
    // Check uniform payments
    if ((component === 'all' || component === 'uniform') && payment.uniform.isPaid && payment.uniform.paymentDate) {
      const paymentDate = new Date(payment.uniform.paymentDate);
      if (paymentDate >= start && paymentDate <= end) {
        totalCollected += payment.uniform.price;
        
        const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
        collectionsByMonth[monthKey] = (collectionsByMonth[monthKey] || 0) + payment.uniform.price;
        
        const method = payment.uniform.paymentMethod || 'cash';
        collectionsByMethod[method] = (collectionsByMethod[method] || 0) + payment.uniform.price;
      }
    }
    
    // Check transportation payments
    if ((component === 'all' || component === 'transportation') && payment.transportation.using) {
      payment.transportation.monthlyPayments.forEach(monthly => {
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
        totalAmounts: paymentRecord.totalAmounts
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Get Payment Statistics by Month
const getPaymentStatsByMonth = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear, component = 'all' } = req.query;
    
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
        tuition: {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0,
          collectionRate: 0
        },
        transportation: {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0,
          collectionRate: 0
        },
        total: {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0,
          collectionRate: 0
        }
      };
    }
    
    // Calculate statistics for each month
    allPayments.forEach(payment => {
      // Tuition monthly payments
      payment.tuitionMonthlyPayments.forEach(monthly => {
        const month = monthly.month;
        const stats = monthlyStats[month];
        
        stats.tuition.expected += monthly.amount;
        stats.tuition.collected += monthly.paidAmount;
        stats.total.expected += monthly.amount;
        stats.total.collected += monthly.paidAmount;
        
        if (monthly.status === 'pending') {
          const pending = monthly.amount - monthly.paidAmount;
          stats.tuition.pending += pending;
          stats.total.pending += pending;
        } else if (monthly.status === 'overdue') {
          const overdue = monthly.amount - monthly.paidAmount;
          stats.tuition.overdue += overdue;
          stats.total.overdue += overdue;
        }
      });
      
      // Transportation monthly payments
      if (payment.transportation.using) {
        payment.transportation.monthlyPayments.forEach(monthly => {
          const month = monthly.month;
          const stats = monthlyStats[month];
          
          stats.transportation.expected += monthly.amount;
          stats.transportation.collected += monthly.paidAmount;
          stats.total.expected += monthly.amount;
          stats.total.collected += monthly.paidAmount;
          
          if (monthly.status === 'pending') {
            const pending = monthly.amount - monthly.paidAmount;
            stats.transportation.pending += pending;
            stats.total.pending += pending;
          } else if (monthly.status === 'overdue') {
            const overdue = monthly.amount - monthly.paidAmount;
            stats.transportation.overdue += overdue;
            stats.total.overdue += overdue;
          }
        });
      }
    });
    
    // Calculate collection rates
    Object.values(monthlyStats).forEach(stats => {
      if (stats.tuition.expected > 0) {
        stats.tuition.collectionRate = ((stats.tuition.collected / stats.tuition.expected) * 100).toFixed(2);
      }
      if (stats.transportation.expected > 0) {
        stats.transportation.collectionRate = ((stats.transportation.collected / stats.transportation.expected) * 100).toFixed(2);
      }
      if (stats.total.expected > 0) {
        stats.total.collectionRate = ((stats.total.collected / stats.total.expected) * 100).toFixed(2);
      }
    });
    
    res.status(200).json({
      academicYear: targetYear,
      component: component,
      monthlyStats: Object.values(monthlyStats)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ✅ UPDATED: Export Payment Data to CSV format
const exportPaymentData = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { academicYear, gradeCategory, grade, paymentStatus, component = 'all' } = req.query;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    let filter = {
      school: schoolId,
      academicYear: targetYear
    };
    
    if (gradeCategory) {
      filter.gradeCategory = gradeCategory;
    }
    
    if (grade) {
      filter.grade = grade;
    }
    
    if (paymentStatus) {
      filter.overallStatus = paymentStatus;
    }
    
    const payments = await StudentPayment.find(filter)
      .populate('student', 'name email')
      .populate('createdBy', 'name');
    
    // Prepare CSV data based on component
    let csvData;
    
    if (component === 'tuition') {
      csvData = payments.map(payment => ({
        'Student Name': payment.student.name,
        'Student Email': payment.student.email,
        'Grade': payment.grade,
        'Grade Category': payment.gradeCategory,
        'Student Class': payment.studentClass,
        'Tuition Total Amount': payment.totalAmounts.tuition,
        'Tuition Paid Amount': payment.paidAmounts.tuition,
        'Tuition Remaining Amount': payment.remainingAmounts.tuition,
        'Tuition Status': payment.componentStatus.tuition,
        'Payment Type': payment.paymentType,
        'Academic Year': payment.academicYear,
        'Created Date': payment.createdAt?.toLocaleDateString(),
        'Created By': payment.createdBy?.name || 'Unknown'
      }));
    } else if (component === 'uniform') {
      csvData = payments.filter(p => p.uniform.purchased).map(payment => ({
        'Student Name': payment.student.name,
        'Student Email': payment.student.email,
        'Grade': payment.grade,
        'Grade Category': payment.gradeCategory,
        'Student Class': payment.studentClass,
        'Uniform Price': payment.uniform.price,
        'Uniform Paid': payment.uniform.isPaid ? 'Yes' : 'No',
        'Uniform Status': payment.componentStatus.uniform,
        'Payment Date': payment.uniform.paymentDate?.toLocaleDateString() || 'Not Paid',
        'Payment Method': payment.uniform.paymentMethod || 'N/A',
        'Receipt Number': payment.uniform.receiptNumber || 'N/A',
        'Academic Year': payment.academicYear,
        'Created Date': payment.createdAt?.toLocaleDateString(),
        'Created By': payment.createdBy?.name || 'Unknown'
      }));
    } else if (component === 'transportation') {
      csvData = payments.filter(p => p.transportation.using).map(payment => ({
        'Student Name': payment.student.name,
        'Student Email': payment.student.email,
        'Grade': payment.grade,
        'Grade Category': payment.gradeCategory,
        'Student Class': payment.studentClass,
        'Transportation Type': payment.transportation.type,
        'Monthly Price': payment.transportation.monthlyPrice,
        'Total Amount': payment.totalAmounts.transportation,
        'Paid Amount': payment.paidAmounts.transportation,
        'Remaining Amount': payment.remainingAmounts.transportation,
        'Transportation Status': payment.componentStatus.transportation,
        'Academic Year': payment.academicYear,
        'Created Date': payment.createdAt?.toLocaleDateString(),
        'Created By': payment.createdBy?.name || 'Unknown'
      }));
    } else {
      csvData = payments.map(payment => ({
        'Student Name': payment.student.name,
        'Student Email': payment.student.email,
        'Grade': payment.grade,
        'Grade Category': payment.gradeCategory,
        'Student Class': payment.studentClass,
        'Total Amount': payment.totalAmounts.grandTotal,
        'Paid Amount': payment.paidAmounts.grandTotal,
        'Remaining Amount': payment.remainingAmounts.grandTotal,
        'Overall Status': payment.overallStatus,
        'Tuition Status': payment.componentStatus.tuition,
        'Uniform Purchased': payment.uniform.purchased ? 'Yes' : 'No',
        'Uniform Status': payment.componentStatus.uniform,
        'Transportation Used': payment.transportation.using ? 'Yes' : 'No',
        'Transportation Status': payment.componentStatus.transportation,
        'Payment Type': payment.paymentType,
        'Academic Year': payment.academicYear,
        'Created Date': payment.createdAt?.toLocaleDateString(),
        'Created By': payment.createdBy?.name || 'Unknown'
      }));
    }
    
    res.status(200).json({
      message: 'Payment data exported successfully',
      totalRecords: csvData.length,
      component: component,
      data: csvData
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete All Payment Records
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
const updatePaymentRecordComponents = async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = req.schoolId;
    const userId = req.userId;
    const { 
      academicYear,
      hasUniform = false,
      transportationType = null  // 'close', 'far', or null
    } = req.body;
    
    // Get current academic year if not specified
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const targetYear = academicYear || `${currentYear}-${currentYear + 1}`;
    
    // Find existing payment record
    const paymentRecord = await StudentPayment.findOne({
      student: studentId,
      school: schoolId,
      academicYear: targetYear
    });
    
    if (!paymentRecord) {
      return res.status(404).json({ 
        message: 'Payment record not found. Please generate payment schedule first.' 
      });
    }
    
    // Get payment configuration
    const config = await PaymentConfiguration.findOne({
      school: schoolId,
      academicYear: targetYear,
      isActive: true
    });
    
    if (!config) {
      return res.status(404).json({ 
        message: 'Payment configuration not found' 
      });
    }
    
    // Validation: Check if uniform is already paid
    if (!hasUniform && paymentRecord.uniform.isPaid) {
      return res.status(400).json({ 
        message: 'Cannot remove uniform as it has already been paid for' 
      });
    }
    
    // Validation: Check if transportation has paid payments
    if (paymentRecord.transportation.using && paymentRecord.transportation.monthlyPayments) {
      const paidTransportPayments = paymentRecord.transportation.monthlyPayments
        .filter(payment => payment.status === 'paid');
      
      if (paidTransportPayments.length > 0 && 
          transportationType !== paymentRecord.transportation.type) {
        return res.status(400).json({ 
          message: 'Cannot change transportation type as payments have already been made' 
        });
      }
    }
    
    // Store old amounts for adjustment calculations
    const oldUniformAmount = paymentRecord.totalAmounts.uniform;
    const oldTransportationAmount = paymentRecord.totalAmounts.transportation;
    const oldPaidUniform = paymentRecord.paidAmounts.uniform;
    const oldPaidTransportation = paymentRecord.paidAmounts.transportation;
    
    // Update uniform configuration
    let newUniformAmount = 0;
    if (hasUniform && config.uniform.enabled) {
      newUniformAmount = config.uniform.price;
      
      // Update uniform object
      paymentRecord.uniform.purchased = true;
      paymentRecord.uniform.price = newUniformAmount;
      
      // Keep existing payment status if uniform was already purchased
      if (!paymentRecord.uniform.purchased) {
        paymentRecord.uniform.isPaid = false;
        paymentRecord.componentStatus.uniform = 'pending';
      }
    } else {
      // Remove uniform (only if not paid)
      paymentRecord.uniform.purchased = false;
      paymentRecord.uniform.price = 0;
      paymentRecord.uniform.isPaid = false;
      paymentRecord.uniform.paymentDate = null;
      paymentRecord.uniform.paymentMethod = null;
      paymentRecord.uniform.receiptNumber = null;
      paymentRecord.uniform.notes = null;
      paymentRecord.componentStatus.uniform = 'not_applicable';
    }
    
    // Update transportation configuration
    let newTransportationAmount = 0;
    let newMonthlyTransportAmount = 0;
    
    if (transportationType && config.transportation.enabled) {
      // Calculate new transportation amounts
      if (transportationType === 'close' && config.transportation.tariffs.close.enabled) {
        newMonthlyTransportAmount = config.transportation.tariffs.close.monthlyPrice;
      } else if (transportationType === 'far' && config.transportation.tariffs.far.enabled) {
        newMonthlyTransportAmount = config.transportation.tariffs.far.monthlyPrice;
      }
      
      newTransportationAmount = newMonthlyTransportAmount * config.paymentSchedule.totalMonths;
      
      // Update transportation object
      const wasUsingTransportation = paymentRecord.transportation.using;
      const oldTransportationType = paymentRecord.transportation.type;
      
      paymentRecord.transportation.using = true;
      paymentRecord.transportation.type = transportationType;
      paymentRecord.transportation.monthlyPrice = newMonthlyTransportAmount;
      paymentRecord.transportation.totalAmount = newTransportationAmount;
      
      // If transportation type changed or newly added, regenerate monthly payments
      if (!wasUsingTransportation || oldTransportationType !== transportationType) {
        // Only regenerate if no payments have been made
        const existingPaidPayments = paymentRecord.transportation.monthlyPayments
          ?.filter(payment => payment.status === 'paid') || [];
        
        if (existingPaidPayments.length === 0) {
          // Generate new transportation payment schedule
          const transportationSchedule = generateTransportationPaymentSchedule(
            config.paymentSchedule.startMonth,
            config.paymentSchedule.endMonth,
            config.paymentSchedule.totalMonths,
            newMonthlyTransportAmount,
            targetYear
          );
          
          paymentRecord.transportation.monthlyPayments = transportationSchedule;
          paymentRecord.componentStatus.transportation = 'pending';
        } else {
          // Update existing unpaid payments with new amount
          paymentRecord.transportation.monthlyPayments.forEach(payment => {
            if (payment.status === 'pending' || payment.status === 'partial') {
              payment.amount = newMonthlyTransportAmount;
            }
          });
        }
      }
    } else {
      // Remove transportation (only if no payments made)
      const existingPaidPayments = paymentRecord.transportation.monthlyPayments
        ?.filter(payment => payment.status === 'paid') || [];
      
      if (existingPaidPayments.length === 0) {
        paymentRecord.transportation.using = false;
        paymentRecord.transportation.type = null;
        paymentRecord.transportation.monthlyPrice = 0;
        paymentRecord.transportation.totalAmount = 0;
        paymentRecord.transportation.monthlyPayments = [];
        paymentRecord.componentStatus.transportation = 'not_applicable';
      }
    }
    
    // Update total amounts
    paymentRecord.totalAmounts.uniform = newUniformAmount;
    paymentRecord.totalAmounts.transportation = newTransportationAmount;
    paymentRecord.totalAmounts.grandTotal = 
      paymentRecord.totalAmounts.tuition + newUniformAmount + newTransportationAmount;
    
    // Adjust paid amounts if uniform was removed
    if (!hasUniform && oldPaidUniform > 0) {
      paymentRecord.paidAmounts.uniform = 0;
      paymentRecord.paidAmounts.grandTotal -= oldPaidUniform;
    } else if (hasUniform && paymentRecord.uniform.isPaid) {
      // Update paid amount to new uniform price if already paid
      const paidAmountDifference = newUniformAmount - oldPaidUniform;
      paymentRecord.paidAmounts.uniform = newUniformAmount;
      paymentRecord.paidAmounts.grandTotal += paidAmountDifference;
    }
    
    // Adjust transportation paid amounts if service was removed
    if (!transportationType && oldPaidTransportation > 0) {
      paymentRecord.paidAmounts.transportation = 0;
      paymentRecord.paidAmounts.grandTotal -= oldPaidTransportation;
    }
    
    // Recalculate remaining amounts
    paymentRecord.calculateRemainingAmounts();
    
    // Update overall status
    paymentRecord.updateOverallStatus();
    
    // Save the updated record
    await paymentRecord.save();
    
    res.status(200).json({
      message: 'Payment record components updated successfully',
      paymentRecord: paymentRecord,
      changes: {
        uniform: {
          old: { purchased: !hasUniform, amount: oldUniformAmount },
          new: { purchased: hasUniform, amount: newUniformAmount }
        },
        transportation: {
          old: { using: !!paymentRecord.transportation.type, type: paymentRecord.transportation.type, amount: oldTransportationAmount },
          new: { using: !!transportationType, type: transportationType, amount: newTransportationAmount }
        }
      }
    });
  } catch (error) {
    console.error('Error updating payment record components:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = {
  createOrUpdatePaymentConfig,
  getPaymentConfig,
  getAllStudentsWithPayments,
  generatePaymentForStudent,
  recordUniformPayment,                    // ✅ NEW
  recordMonthlyTuitionPayment,             // ✅ UPDATED
  recordMonthlyTransportationPayment,      // ✅ NEW
  recordAnnualTuitionPayment,              // ✅ UPDATED
  bulkGeneratePayments,
  getPaymentDashboard,
  updateExistingPaymentRecords,
  getStudentPaymentDetails,
  getPaymentReports,
  deletePaymentRecord,
  getPaymentStatsByMonth,
  exportPaymentData,
  deleteAllPaymentRecords,
  updatePaymentRecordComponents,           
};