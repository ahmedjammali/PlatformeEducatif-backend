// config/fileSetup.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Create necessary directories on startup
const setupUploadDirectories = async () => {
  try {
    const notificationsDir = path.join(process.cwd(), 'uploads', 'notifications');
    
    // Create directories if they don't exist
    await fs.mkdir(notificationsDir, { recursive: true });
    
    console.log('Upload directories created successfully');
  } catch (error) {
    console.error('Error creating upload directories:', error);
  }
};

// Middleware to serve static files
const setupFileServing = (app) => {
  // Serve uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
};

module.exports = {
  setupUploadDirectories,
  setupFileServing
};
