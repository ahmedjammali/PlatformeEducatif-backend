const express = require('express');
const router = express.Router();
const contactController = require('../controllers/ContactController');


const {
  authenticate,
  canManageUsers,
  isSuperAdmin,
  isAdminOrHigher,
  isTeacherOrHigher,
  canAccessUserData
} = require('../middleware/auth');



// Create contact
router.post('/',contactController.createContact);


// Protected routes
router.use(authenticate); // All routes below require authentication

// Get all contacts
router.get('/',isSuperAdmin ,contactController.getAllContacts);

// Get contact by ID
router.get('/:id',  isSuperAdmin, contactController.getContactById);

// Update contact
router.put('/:id', isSuperAdmin, contactController.updateContact);

// Delete contact
router.delete('/:id', isSuperAdmin,  contactController.deleteContact);

module.exports = router;
