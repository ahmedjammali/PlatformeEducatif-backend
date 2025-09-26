// models/TeacherAdminSalary.js
const mongoose = require("mongoose");

const teacherAdminSalarySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    salaryConfiguration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalaryConfiguration",
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },

    // Payment schedule for the academic year
    paymentSchedule: [
      {
        month: {
          type: Number,
          required: true,
          min: 1,
          max: 12,
        },
        monthName: {
          type: String,
          required: true,
        },
        dueDate: {
          type: Date,
          required: true,
        },

        // Salary calculation details
        paymentType: {
          type: String,
          enum: ["monthly", "hourly"],
          required: true,
        },

        // For monthly payments
        baseSalaryAmount: {
          type: Number,
          default: 0,
        },

        // For hourly payments
        regularHours: {
          type: Number,
          default: 0,
        },
        actualHoursWorked: {
          type: Number,
          default: function () {
            return this.regularHours; // Default to regular hours
          },
        },
        hourlyRate: {
          type: Number,
          default: 0,
        },
        regularAmount: {
          type: Number,
          default: 0,
        },

        // Extra hours (applicable to both types)
        extraHours: {
          type: Number,
          default: 0,
        },
        extraHourlyRate: {
          type: Number,
          default: 0,
        },
        extraAmount: {
          type: Number,
          default: 0,
        },

        // Total calculation
        totalAmount: {
          type: Number,
          required: true,
          min: [0, "Total amount cannot be negative"],
        },

        // Payment status
        paymentStatus: {
          type: String,
          enum: ["pending", "partial", "paid", "overdue", "cancelled"],
          default: "pending",
        },

        // Payment tracking
        paidDate: Date,
        paidAmount: {
          type: Number,
          default: 0,
        },

        // Payment method and reference
        paymentMethod: {
          type: String,
          enum: ["cash", "bank_transfer", "check", "digital_wallet"],
          default: "cash",
        },
        paymentReference: String,

        // Notes and additional info
        notes: String,

        // Audit fields for this payment
        processedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // Summary fields
    totalScheduledAmount: {
      type: Number,
      default: 0,
    },
    totalPaidAmount: {
      type: Number,
      default: 0,
    },
    totalPendingAmount: {
      type: Number,
      default: 0,
    },

    // Overall status
    overallStatus: {
      type: String,
      enum: ["active", "completed", "suspended", "cancelled"],
      default: "active",
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
teacherAdminSalarySchema.index({ user: 1, academicYear: 1 }, { unique: true });
teacherAdminSalarySchema.index({ school: 1, academicYear: 1 });
teacherAdminSalarySchema.index({ "paymentSchedule.paymentStatus": 1 });
teacherAdminSalarySchema.index({ "paymentSchedule.dueDate": 1 });

// Pre-save middleware to calculate totals
teacherAdminSalarySchema.pre("save", function (next) {
  let totalScheduled = 0;
  let totalPaid = 0;

  this.paymentSchedule.forEach((payment) => {
    totalScheduled += payment.totalAmount;
    if (
      payment.paymentStatus === "paid" ||
      payment.paymentStatus === "partial"
    ) {
      totalPaid += payment.paidAmount || 0;
    }
  });

  this.totalScheduledAmount = totalScheduled;
  this.totalPaidAmount = totalPaid;
  this.totalPendingAmount = totalScheduled - totalPaid;

  next();
});

// Methods to calculate payment amounts
teacherAdminSalarySchema.methods.calculatePaymentAmount = function (
  monthEntry,
  extraHours = 0
) {
  let totalAmount = 0;
  let extraAmount = 0;

  if (monthEntry.paymentType === "monthly") {
    totalAmount = monthEntry.baseSalaryAmount || 0;
  } else if (monthEntry.paymentType === "hourly") {
    totalAmount = (monthEntry.regularHours || 0) * (monthEntry.hourlyRate || 0);
  }

  if (extraHours > 0 && monthEntry.extraHourlyRate > 0) {
    extraAmount = extraHours * monthEntry.extraHourlyRate;
    totalAmount += extraAmount;
  }

  return {
    regularAmount: totalAmount - extraAmount,
    extraAmount: extraAmount,
    totalAmount: totalAmount,
  };
};

module.exports = mongoose.model("TeacherAdminSalary", teacherAdminSalarySchema);
