// app.js - Application configuration and middleware setup
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/userRoutes');
const contactRoutes = require('./routes/contactRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add this temporarily to your app.js before your routes
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'User Management API is running!' });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
// // Global error handler
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ message: 'Something went wrong!' });
// });

// // Handle 404 - This MUST be the absolute last middleware
// app.use('*', (req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

module.exports = app;