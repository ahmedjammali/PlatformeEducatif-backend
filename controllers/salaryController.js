// controllers/salaryController.js
const SalaryConfiguration = require("../models/SalaryConfiguration");
const TeacherAdminSalary = require("../models/TeacherAdminSalary");
const User = require("../models/User");


// Helper function to get month names
const getMonthName = (monthNumber) => {
  const months = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];
  return months[monthNumber - 1];
};

// Helper function to generate salary payment schedule
const generateSalaryPaymentSchedule = (configuration, academicYear) => {
  const schedule = [];
  const currentYear = parseInt(academicYear.split("-")[0]);

  // Generate schedule for month range
  const startMonth = configuration.paymentCalendar.startMonth;
  const endMonth = configuration.paymentCalendar.endMonth;

  // Handle month range (could wrap around year)
  let monthsToProcess = [];
  if (endMonth >= startMonth) {
    // Same year range
    for (let month = startMonth; month <= endMonth; month++) {
      monthsToProcess.push(month);
    }
  } else {
    // Wraps around year (e.g., Oct to March)
    for (let month = startMonth; month <= 12; month++) {
      monthsToProcess.push(month);
    }
    for (let month = 1; month <= endMonth; month++) {
      monthsToProcess.push(month);
    }
  }

  monthsToProcess.forEach((month) => {
    let year = currentYear;

    // Handle year transition (months after August are in next year)
    if (month >= 9) {
      year = currentYear;
    } else {
      year = currentYear + 1;
    }

    // Set due date to the 15th of each month
    const dueDate = new Date(year, month - 1, 15);

    let totalAmount = 0;
    let regularAmount = 0;
    let regularHours = 0;
    let hourlyRate = 0;

    if (configuration.paymentType === "monthly") {
      totalAmount = configuration.baseSalary || 0;
      regularAmount = totalAmount;
    } else if (configuration.paymentType === "hourly") {
      regularHours = 40; // Default hours per month, can be modified during payment
      hourlyRate = configuration.hourlyRate || 0;
      regularAmount = regularHours * hourlyRate;
      totalAmount = regularAmount;
    }

    schedule.push({
      month: month,
      monthName: getMonthName(month),
      dueDate: dueDate,
      paymentType: configuration.paymentType,
      baseSalaryAmount:
        configuration.paymentType === "monthly" ? totalAmount : 0,
      regularHours: regularHours,
      actualHoursWorked: regularHours, // Default to regular hours
      hourlyRate: hourlyRate,
      regularAmount: regularAmount,
      extraHours: 0,
      extraHourlyRate: configuration.extraHourlyRate || 0,
      extraAmount: 0,
      totalAmount: totalAmount,
      paymentStatus: "pending",
    });
  });

  return schedule;
};

// Create or update salary configuration
const createSalaryConfiguration = async (req, res) => {
  try {
    const {
      userId,
      paymentType,
      baseSalary,
      hourlyRate,
      allowExtraHours,
      extraHourlyRate,
      paymentCalendar,
    } = req.body;
    const schoolId = req.user.school;
    const academicYear = req.body.academicYear || "2024-2025";

    // Validate user exists and is teacher or admin
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!["teacher", "admin"].includes(user.role)) {
      return res
        .status(400)
        .json({ message: "User must be a teacher or admin" });
    }

    // Check if configuration already exists
    const existingConfig = await SalaryConfiguration.findOne({
      user: userId,
      academicYear: academicYear,
    });

    if (existingConfig) {
      return res.status(400).json({
        message:
          "Salary configuration already exists for this user and academic year",
      });
    }

    // Create new configuration
    const configData = {
      user: userId,
      school: schoolId,
      academicYear,
      paymentType,
      allowExtraHours,
      paymentCalendar,
      createdBy: req.user.id,
    };

    if (paymentType === "monthly") {
      configData.baseSalary = baseSalary;
    } else {
      configData.hourlyRate = hourlyRate;
    }

    if (allowExtraHours) {
      configData.extraHourlyRate = extraHourlyRate;
    }

    const salaryConfig = new SalaryConfiguration(configData);
    await salaryConfig.save();

    // Generate initial salary record
    const paymentSchedule = generateSalaryPaymentSchedule(
      salaryConfig,
      academicYear
    );

    const salaryRecord = new TeacherAdminSalary({
      user: userId,
      school: schoolId,
      salaryConfiguration: salaryConfig._id,
      academicYear,
      paymentSchedule,
      createdBy: req.user.id,
    });

    await salaryRecord.save();

    res.status(201).json({
      message: "Salary configuration created successfully",
      salaryConfiguration: salaryConfig,
      salaryRecord: salaryRecord,
    });
  } catch (error) {
    console.error("Error creating salary configuration:", error);
    res.status(500).json({
      message: "Error creating salary configuration",
      error: error.message,
    });
  }
};

// Get all teachers and admins
const getTeachersAndAdmins = async (req, res) => {
  try {
    const schoolId = req.user.school;

    const users = await User.find({
      school: schoolId,
      role: { $in: ["teacher", "admin"] },
    })
      .select("-password")
      .populate({
        path: "teachingClasses.class",
        model: "Class",
        select: "name level",
      })
      .populate({
        path: "teachingClasses.subjects",
        model: "Subject",
        select: "name",
      })
      .populate({
        path: "studentClass",
        model: "Class",
        select: "name level",
      });

    res.json(users);
  } catch (error) {
    console.error("Error fetching teachers and admins:", error);
    res
      .status(500)
      .json({ message: "Error fetching users", error: error.message });
  }
};

// Get salary configurations for school
const getSalaryConfigurations = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { academicYear } = req.query;

    const filter = { school: schoolId };
    if (academicYear) {
      filter.academicYear = academicYear;
    }

    const configurations = await SalaryConfiguration.find(filter)
      .populate("user", "name email role")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(configurations);
  } catch (error) {
    console.error("Error fetching salary configurations:", error);
    res.status(500).json({
      message: "Error fetching salary configurations",
      error: error.message,
    });
  }
};

// Get salary records for school
const getSalaryRecords = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { academicYear, userId, status } = req.query;

    const filter = { school: schoolId };
    if (academicYear) {
      filter.academicYear = academicYear;
    }
    if (userId) {
      filter.user = userId;
    }
    if (status) {
      filter.overallStatus = status;
    }

    const salaryRecords = await TeacherAdminSalary.find(filter)
      .populate("user", "name email role")
      .populate("salaryConfiguration")
      .sort({ createdAt: -1 });

    res.json(salaryRecords);
  } catch (error) {
    console.error("Error fetching salary records:", error);
    res
      .status(500)
      .json({ message: "Error fetching salary records", error: error.message });
  }
};

// Update extra hours for a specific month
const updateExtraHours = async (req, res) => {
  try {
    const { salaryId } = req.params;
    const { month, extraHours } = req.body;

    const salaryRecord = await TeacherAdminSalary.findById(salaryId).populate(
      "salaryConfiguration"
    );

    if (!salaryRecord) {
      return res.status(404).json({ message: "Salary record not found" });
    }

    // Find the payment for the specified month
    const paymentIndex = salaryRecord.paymentSchedule.findIndex(
      (p) => p.month === month
    );
    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment month not found" });
    }

    const payment = salaryRecord.paymentSchedule[paymentIndex];
    const config = salaryRecord.salaryConfiguration;

    if (!config.allowExtraHours) {
      return res.status(400).json({
        message: "Extra hours are not allowed for this configuration",
      });
    }

    // Update extra hours and recalculate amounts
    payment.extraHours = extraHours || 0;
    payment.extraAmount = payment.extraHours * (config.extraHourlyRate || 0);

    // Calculate total based on payment type
    if (payment.paymentType === "monthly") {
      payment.totalAmount = (payment.baseSalaryAmount || 0) + payment.extraAmount;
    } else {
      payment.totalAmount = (payment.regularAmount || 0) + payment.extraAmount;
    }

    salaryRecord.updatedBy = req.user.id;
    await salaryRecord.save();

    res.json({
      message: "Extra hours updated successfully",
      payment: payment,
    });
  } catch (error) {
    console.error("Error updating extra hours:", error);
    res
      .status(500)
      .json({ message: "Error updating extra hours", error: error.message });
  }
};

// Record payment
const recordPayment = async (req, res) => {
  try {
    const { salaryId } = req.params;
    const {
      month,
      paidAmount,
      paymentDate,
      paymentMethod,
      paymentReference,
      notes,
      actualHoursWorked,
    } = req.body;

    const salaryRecord = await TeacherAdminSalary.findById(salaryId).populate(
      "salaryConfiguration"
    );

    if (!salaryRecord) {
      return res.status(404).json({ message: "Salary record not found" });
    }

    // Find the payment for the specified month
    const paymentIndex = salaryRecord.paymentSchedule.findIndex(
      (p) => p.month === month
    );
    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment month not found" });
    }

    const payment = salaryRecord.paymentSchedule[paymentIndex];

    // Handle hourly payment with actual hours worked
    if (payment.paymentType === "hourly" && actualHoursWorked !== undefined) {
      payment.actualHoursWorked = actualHoursWorked;

      // Recalculate regular amount based on actual hours
      payment.regularAmount = actualHoursWorked * payment.hourlyRate;

      // Recalculate total amount (regular + extra)
      payment.totalAmount = payment.regularAmount + payment.extraAmount;
    }

    // Update payment details
    const paidAmountValue = paidAmount || payment.totalAmount;

    payment.paidDate = paymentDate || new Date();
    payment.paidAmount = (payment.paidAmount || 0) + paidAmountValue; // Add to existing paid amount
    payment.paymentMethod = paymentMethod || "cash";
    payment.paymentReference = paymentReference;
    payment.notes = notes;
    payment.processedBy = req.user.id;

    // Determine payment status based on TOTAL amount paid (after updating paidAmount)
    if (payment.paidAmount >= payment.totalAmount) {
      payment.paymentStatus = "paid";
    } else if (payment.paidAmount > 0) {
      payment.paymentStatus = "partial";
    } else {
      payment.paymentStatus = "pending";
    }

    salaryRecord.updatedBy = req.user.id;
    await salaryRecord.save();

    res.json({
      message: "Payment recorded successfully",
      payment: payment,
    });
  } catch (error) {
    console.error("Error recording payment:", error);
    res
      .status(500)
      .json({ message: "Error recording payment", error: error.message });
  }
};

// Get salary summary for dashboard
const getSalarySummary = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { academicYear } = req.query;

    const filter = { school: schoolId };
    if (academicYear) {
      filter.academicYear = academicYear;
    }

    const salaryRecords = await TeacherAdminSalary.find(filter);

    let totalScheduled = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let pendingPayments = 0;
    let overdue = 0;

    const currentDate = new Date();

    salaryRecords.forEach((record) => {
      totalScheduled += record.totalScheduledAmount;
      totalPaid += record.totalPaidAmount;
      totalPending += record.totalPendingAmount;

      record.paymentSchedule.forEach((payment) => {
        if (payment.paymentStatus === "pending") {
          pendingPayments++;
          if (payment.dueDate < currentDate) {
            overdue++;
          }
        }
      });
    });

    res.json({
      totalScheduled,
      totalPaid,
      totalPending,
      pendingPayments,
      overdue,
      totalRecords: salaryRecords.length,
    });
  } catch (error) {
    console.error("Error fetching salary summary:", error);
    res
      .status(500)
      .json({ message: "Error fetching salary summary", error: error.message });
  }
};

// Update salary configuration
const updateSalaryConfiguration = async (req, res) => {
  try {
    const { configId } = req.params;
    const updates = req.body;

    const config = await SalaryConfiguration.findById(configId);
    if (!config) {
      return res
        .status(404)
        .json({ message: "Salary configuration not found" });
    }

    // Update configuration
    Object.assign(config, updates);
    config.updatedBy = req.user.id;
    await config.save();

    // Regenerate salary schedule if payment calendar changed
    if (updates.paymentCalendar) {
      const salaryRecord = await TeacherAdminSalary.findOne({
        salaryConfiguration: configId,
      });

      if (salaryRecord) {
        const newSchedule = generateSalaryPaymentSchedule(
          config,
          salaryRecord.academicYear
        );

        // Preserve existing payment statuses and extra hours
        newSchedule.forEach((newPayment) => {
          const existingPayment = salaryRecord.paymentSchedule.find(
            (p) => p.month === newPayment.month
          );
          if (existingPayment) {
            newPayment.paymentStatus = existingPayment.paymentStatus;
            newPayment.paidDate = existingPayment.paidDate;
            newPayment.paidAmount = existingPayment.paidAmount;
            newPayment.extraHours = existingPayment.extraHours;
            newPayment.extraAmount = existingPayment.extraAmount;
            newPayment.totalAmount =
              newPayment.regularAmount + newPayment.extraAmount;
            newPayment.paymentMethod = existingPayment.paymentMethod;
            newPayment.paymentReference = existingPayment.paymentReference;
            newPayment.notes = existingPayment.notes;
            newPayment.processedBy = existingPayment.processedBy;
          }
        });

        salaryRecord.paymentSchedule = newSchedule;
        salaryRecord.updatedBy = req.user.id;
        await salaryRecord.save();
      }
    }

    res.json({
      message: "Salary configuration updated successfully",
      configuration: config,
    });
  } catch (error) {
    console.error("Error updating salary configuration:", error);
    res.status(500).json({
      message: "Error updating salary configuration",
      error: error.message,
    });
  }
};

// Delete salary configuration
const deleteSalaryConfiguration = async (req, res) => {
  try {
    const { configurationId } = req.params;
    const schoolId = req.user.school;

    // Find the configuration
    const configuration = await SalaryConfiguration.findOne({
      _id: configurationId,
      school: schoolId,
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        message: "Configuration salariale introuvable",
      });
    }

    // Check if there are any associated salary records
    const salaryRecords = await TeacherAdminSalary.find({
      salaryConfiguration: configurationId,
    });

    // Force delete all associated salary records (including paid ones)
    await TeacherAdminSalary.deleteMany({
      salaryConfiguration: configurationId,
    });

    // Delete the configuration
    await SalaryConfiguration.findByIdAndDelete(configurationId);

    res.status(200).json({
      success: true,
      message: "Configuration salariale supprimée avec succès",
    });
  } catch (error) {
    console.error("Error deleting salary configuration:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression de la configuration",
      error: error.message,
    });
  }
};
// Update payment hours (both regular and extra hours) for a specific month
const updatePaymentHours = async (req, res) => {
  try {
    const { userId, month, actualHoursWorked, extraHours } = req.body;

    // Validate required fields
    if (!userId || !month) {
      return res.status(400).json({
        message: "User ID and month are required",
      });
    }

    // Find the salary record for this user
    const salaryRecord = await TeacherAdminSalary.findOne({
      user: userId,
    }).populate("salaryConfiguration");

    if (!salaryRecord) {
      return res.status(404).json({ message: "Salary record not found" });
    }

    // Find the payment for the specified month
    const paymentIndex = salaryRecord.paymentSchedule.findIndex(
      (p) => p.month === month
    );
    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment month not found" });
    }

    const payment = salaryRecord.paymentSchedule[paymentIndex];
    const config = salaryRecord.salaryConfiguration;

    // Update hours worked if provided
    if (actualHoursWorked !== undefined) {
      payment.actualHoursWorked = Math.max(0, actualHoursWorked || 0);
    }

    // Update extra hours if provided (only if allowExtraHours is enabled)
    if (extraHours !== undefined && config.allowExtraHours) {
      payment.extraHours = Math.max(0, extraHours || 0);
    }

    // Recalculate amounts based on payment type
    if (config.paymentType === "hourly") {
      const regularHours = Math.max(0, payment.regularHours || 40);
      const hoursWorked = Math.max(0, payment.actualHoursWorked || regularHours);
      const hourlyRate = Math.max(0, config.hourlyRate || 0);
      
      // ALL hours worked are paid at the SAME rate (regular hourly rate)
      // No automatic overtime premium unless explicitly configured
      payment.regularAmount = hoursWorked * hourlyRate;

      // Store the hourly rate used
      payment.hourlyRate = hourlyRate;

      // Calculate separate extra hours amount (independent bonus hours - only if feature enabled)
      let separateExtraPayment = 0;
      if (config.allowExtraHours && config.extraHourlyRate) {
        const separateExtraHours = Math.max(0, payment.extraHours || 0);
        separateExtraPayment = separateExtraHours * config.extraHourlyRate;
        payment.extraHourlyRate = config.extraHourlyRate;
      } else {
        payment.extraHourlyRate = 0;
      }
      payment.extraAmount = separateExtraPayment;

      // Total amount = all hours worked + separate extra hours
      payment.totalAmount = payment.regularAmount + payment.extraAmount;

      console.log('Hours calculation:', {
        regularHours,
        hoursWorked,
        hourlyRate,
        regularAmount: payment.regularAmount.toFixed(2),
        extraHours: payment.extraHours || 0,
        extraHourlyRate: payment.extraHourlyRate,
        extraAmount: payment.extraAmount.toFixed(2),
        totalAmount: payment.totalAmount.toFixed(2)
      });

    } else if (config.paymentType === "monthly") {
      // For monthly payments, only extra hours affect the total
      const baseSalary = Math.max(0, payment.baseSalaryAmount || config.baseSalary || 0);
      
      if (config.allowExtraHours && config.extraHourlyRate) {
        const separateExtraHours = Math.max(0, payment.extraHours || 0);
        payment.extraAmount = separateExtraHours * config.extraHourlyRate;
      } else {
        payment.extraAmount = 0;
      }
      
      payment.totalAmount = baseSalary + payment.extraAmount;
    }

    // Update payment status if it was paid
    if (payment.paidAmount > 0) {
      if (payment.paidAmount >= payment.totalAmount) {
        payment.paymentStatus = "paid";
      } else {
        payment.paymentStatus = "partial";
      }
    }

    salaryRecord.updatedBy = req.user.id;
    await salaryRecord.save();

    res.json({
      message: "Payment hours updated successfully",
      payment: payment,
      calculation: {
        actualHoursWorked: payment.actualHoursWorked,
        extraHours: payment.extraHours || 0,
        hourlyRate: payment.hourlyRate,
        regularAmount: payment.regularAmount,
        extraAmount: payment.extraAmount,
        totalAmount: payment.totalAmount
      }
    });
  } catch (error) {
    console.error("Error updating payment hours:", error);
    res.status(500).json({
      message: "Error updating payment hours",
      error: error.message,
    });
  }
};
module.exports = {
  createSalaryConfiguration,
  getTeachersAndAdmins,
  getSalaryConfigurations,
  getSalaryRecords,
  updateExtraHours,
  updatePaymentHours,
  recordPayment,
  getSalarySummary,
  updateSalaryConfiguration,
  deleteSalaryConfiguration,
};
