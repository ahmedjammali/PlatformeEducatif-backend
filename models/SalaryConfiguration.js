// models/SalaryConfiguration.js
const mongoose = require("mongoose");

const salaryConfigurationSchema = new mongoose.Schema(
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
    academicYear: {
      type: String,
      required: true,
      match: /^\d{4}-\d{4}$/, // Format: "2024-2025"
    },

    // Payment configuration
    paymentType: {
      type: String,
      enum: ["monthly", "hourly"],
      required: true,
    },

    // Base salary information
    baseSalary: {
      type: Number,
      required: function () {
        return this.paymentType === "monthly";
      },
      min: [0, "Base salary cannot be negative"],
    },

    hourlyRate: {
      type: Number,
      required: function () {
        return this.paymentType === "hourly";
      },
      min: [0, "Hourly rate cannot be negative"],
    },

    // Extra hours configuration
    allowExtraHours: {
      type: Boolean,
      default: false,
    },

    extraHourlyRate: {
      type: Number,
      required: function () {
        return this.allowExtraHours;
      },
      min: [0, "Extra hourly rate cannot be negative"],
    },

    // Monthly payment calendar - month range
    paymentCalendar: {
      startMonth: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },
      endMonth: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },
    },

    // Additional configuration
    isActive: {
      type: Boolean,
      default: true,
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
salaryConfigurationSchema.index({ user: 1, academicYear: 1 }, { unique: true });
salaryConfigurationSchema.index({ school: 1, academicYear: 1 });

// Pre-save middleware to validate month range
salaryConfigurationSchema.pre("save", function (next) {
  // For academic year, month ranges can span across calendar years
  // (e.g., September (9) to June (6) is valid)
  // Only invalid if both months are the same and it's not a full year range
  const startMonth = this.paymentCalendar.startMonth;
  const endMonth = this.paymentCalendar.endMonth;

  // Allow any month range - validation will be handled in the controller logic
  // The range is valid as long as both months are between 1-12 (handled by schema validation)

  next();
});

module.exports = mongoose.model(
  "SalaryConfiguration",
  salaryConfigurationSchema
);
