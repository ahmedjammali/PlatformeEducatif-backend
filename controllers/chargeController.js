const Charge = require("../models/Charge");
const mongoose = require("mongoose");

// Create a new charge
const createCharge = async (req, res) => {
  try {
    const { categorie, description, date, montant, school } = req.body;

    // Validate required fields
    if (!categorie || !description || !date || !montant) {
      return res.status(400).json({
        message: "Category, description, date, and amount are required",
      });
    }

    // Validate amount
    if (montant <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    // Validate date (should not be in the future)
    const chargeDate = new Date(date);
    if (chargeDate > new Date()) {
      return res.status(400).json({
        message: "Date cannot be in the future",
      });
    }

    const charge = new Charge({
      categorie,
      description,
      date: chargeDate,
      montant: Number(montant),
      school: school || req.user?.school,
      createdBy: req.user?._id,
    });

    const savedCharge = await charge.save();

    res.status(201).json({
      message: "Charge created successfully",
      charge: savedCharge,
    });
  } catch (error) {
    console.error("Error creating charge:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get all charges with pagination and filtering
const getAllCharges = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = {};

    // Add school filter if user has school
    if (req.user?.school) {
      query.school = req.user.school;
    }

    // Category filter
    if (category && category !== "") {
      query.categorie = category;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Execute queries
    const [charges, total] = await Promise.all([
      Charge.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate("school", "name")
        .populate("createdBy", "name email"),
      Charge.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      charges,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: limitNum,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching charges:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get charge by ID
const getChargeById = async (req, res) => {
  try {
    const { chargeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: "Invalid charge ID" });
    }

    const query = { _id: chargeId };

    // Add school filter if user has school
    if (req.user?.school) {
      query.school = req.user.school;
    }

    const charge = await Charge.findOne(query)
      .populate("school", "name")
      .populate("createdBy", "name email");

    if (!charge) {
      return res.status(404).json({ message: "Charge not found" });
    }

    res.status(200).json({ charge });
  } catch (error) {
    console.error("Error fetching charge:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Update charge
const updateCharge = async (req, res) => {
  try {
    const { chargeId } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: "Invalid charge ID" });
    }

    // Validate amount if provided
    if (updates.montant !== undefined && updates.montant <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    // Validate date if provided
    if (updates.date) {
      const chargeDate = new Date(updates.date);
      if (chargeDate > new Date()) {
        return res.status(400).json({
          message: "Date cannot be in the future",
        });
      }
      updates.date = chargeDate;
    }

    const query = { _id: chargeId };

    // Add school filter if user has school
    if (req.user?.school) {
      query.school = req.user.school;
    }

    const charge = await Charge.findOneAndUpdate(query, updates, {
      new: true,
      runValidators: true,
    })
      .populate("school", "name")
      .populate("createdBy", "name email");

    if (!charge) {
      return res.status(404).json({ message: "Charge not found" });
    }

    res.status(200).json({
      message: "Charge updated successfully",
      charge,
    });
  } catch (error) {
    console.error("Error updating charge:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete charge
const deleteCharge = async (req, res) => {
  try {
    const { chargeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chargeId)) {
      return res.status(400).json({ message: "Invalid charge ID" });
    }

    const query = { _id: chargeId };

    // Add school filter if user has school
    if (req.user?.school) {
      query.school = req.user.school;
    }

    const charge = await Charge.findOneAndDelete(query);

    if (!charge) {
      return res.status(404).json({ message: "Charge not found" });
    }

    res.status(200).json({
      message: "Charge deleted successfully",
      deletedCharge: charge,
    });
  } catch (error) {
    console.error("Error deleting charge:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get charges summary/analytics
const getChargesSummary = async (req, res) => {
  try {
    const { category, startDate, endDate } = req.query;
    const schoolId = req.user?.school;

    // Build query for filtering
    const baseQuery = {
      ...(schoolId ? { school: new mongoose.Types.ObjectId(schoolId) } : {}),
    };

    // Add category filter
    if (category && category !== "") {
      baseQuery.categorie = category;
    }

    // Add date range filter
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) baseQuery.date.$gte = new Date(startDate);
      if (endDate) baseQuery.date.$lte = new Date(endDate);
    }

    // Get overall summary with filters
    const summaryAgg = await Charge.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalCharges: { $sum: 1 },
          totalAmount: { $sum: "$montant" },
        },
      },
    ]);

    const summary =
      summaryAgg.length > 0
        ? summaryAgg[0]
        : {
            totalCharges: 0,
            totalAmount: 0,
          };

    // Get monthly total for current month if no date range specified
    if (!startDate && !endDate) {
      const currentDate = new Date();
      const monthStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
      const monthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );

      const monthlyQuery = {
        ...baseQuery,
        date: { $gte: monthStart, $lte: monthEnd },
      };

      const monthlyAgg = await Charge.aggregate([
        { $match: monthlyQuery },
        {
          $group: {
            _id: null,
            monthlyTotal: { $sum: "$montant" },
          },
        },
      ]);

      summary.monthlyTotal =
        monthlyAgg.length > 0 ? monthlyAgg[0].monthlyTotal : 0;
    } else {
      summary.monthlyTotal = summary.totalAmount; // If date range specified, use total amount
    }

    // Return only essential data
    res.status(200).json({
      totalCharges: summary.totalCharges,
      totalAmount: summary.totalAmount,
      monthlyTotal: summary.monthlyTotal,
    });
  } catch (error) {
    console.error("Error fetching charges summary:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Bulk operations
const bulkDeleteCharges = async (req, res) => {
  try {
    const { chargeIds } = req.body;

    if (!chargeIds || !Array.isArray(chargeIds) || chargeIds.length === 0) {
      return res.status(400).json({
        message: "Charge IDs array is required",
      });
    }

    // Validate all IDs
    const invalidIds = chargeIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: "Invalid charge IDs provided",
        invalidIds,
      });
    }

    const query = { _id: { $in: chargeIds } };

    // Add school filter if user has school
    if (req.user?.school) {
      query.school = req.user.school;
    }

    const result = await Charge.deleteMany(query);

    res.status(200).json({
      message: `${result.deletedCount} charges deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting charges:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  createCharge,
  getAllCharges,
  getChargeById,
  updateCharge,
  deleteCharge,
  getChargesSummary,
  bulkDeleteCharges,
};
