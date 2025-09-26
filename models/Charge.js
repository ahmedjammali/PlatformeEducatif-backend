const mongoose = require("mongoose");

const chargeSchema = new mongoose.Schema(
  {
    categorie: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [3, "Description must be at least 3 characters long"],
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      validate: {
        validator: function (value) {
          return value <= new Date();
        },
        message: "Date cannot be in the future",
      },
    },
    montant: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
      validate: {
        validator: function (value) {
          return Number.isFinite(value) && value > 0;
        },
        message: "Amount must be a valid positive number",
      },
    },

    // For tracking which school this charge belongs to
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: false, // Make it optional for now, but can be required later
    },
    // User who created this charge
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
chargeSchema.index({ categorie: 1 });
chargeSchema.index({ date: -1 });
chargeSchema.index({ school: 1, date: -1 });
chargeSchema.index({ createdAt: -1 });

// Virtual for formatted amount (can be used in aggregations)
chargeSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
  }).format(this.montant);
});

module.exports = mongoose.model("Charge", chargeSchema);
