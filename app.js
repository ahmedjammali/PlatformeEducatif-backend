// app.js
const express = require("express");
const cors = require("cors");

const app = express();
const {
  setupUploadDirectories,
  setupFileServing,
} = require("./config/fileSetup");
const notificationRoutes = require("./routes/NotificationRoutes");
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const schoolRoutes = require("./routes/schoolRoutes");
const userRoutes = require("./routes/userRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const classRoutes = require("./routes/classRoutes");
const exerciseRoutes = require("./routes/exerciseRoutes");
const gradeRoutes = require("./routes/gradeRoutes");
const progressRoutes = require("./routes/progressRoutes");
const contactRoutes = require("./routes/contactRoutes");

const chatRoutes = require("./routes/chatRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const chargeRoutes = require("./routes/chargesRoutes");
const salaryRoutes = require("./routes/salaryRoutes");
const incomeAnalyticsRoutes = require("./routes/incomeAnalyticsRoutes");
const outcomeAnalyticsRoutes = require("./routes/outcomeAnalyticsRoutes");
const exportRoutes = require("./routes/exportRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");

setupUploadDirectories().catch(console.error);
// API Routes
app.use("/api/schools", schoolRoutes);
app.use("/api/users", userRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/schedules", scheduleRoutes);

app.use("/api/payments", paymentRoutes);
app.use("/api/charges", chargeRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/income-analytics", incomeAnalyticsRoutes);
app.use("/api/outcome-analytics", outcomeAnalyticsRoutes);
app.use("/api/exports", exportRoutes);

app.use("/api/chat", chatRoutes);
setupFileServing(app);
// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Educational Platform API is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

module.exports = app;
