// server.js
const app = require('./app'); // Import the app setup
const connectDB = require('./config/db'); // Import DB connection
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and then start the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
});
