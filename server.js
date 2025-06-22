const mongoose = require('mongoose');
require('dotenv').config();
const app = require('./app');

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Create SuperAdmin on first run (optional)
const createSuperAdmin = async () => {
  try {
    const User = require('./models/User');
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    
    if (!existingSuperAdmin) {
      const superAdmin = new User({
        name: "Super Admin",
        email: "superadmin@platform.com",
        password: "superadmin123",
        role: "superadmin"
      });

      await superAdmin.save();
      console.log('SuperAdmin created successfully');
      console.log('Email: superadmin@platform.com');
      console.log('Password: superadmin123');
    }
  } catch (error) {
    console.error('Error creating SuperAdmin:', error);
  }
};

// Create superadmin after DB connection
mongoose.connection.once('open', () => {
  createSuperAdmin();
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});