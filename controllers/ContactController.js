const Contact = require('../models/Contact');

// Create a new contact
exports.createContact = async (req, res) => {
  const { name, email, phone, message } = req.body;

  // Manual validation
  const errors = [];
  if (!name || name.trim() === '') errors.push('Name is required.');
  if (!email || email.trim() === '') errors.push('Email is required.');
  if (!phone || isNaN(phone)) errors.push('Valid phone number is required.');
  if (!message || message.trim() === '') errors.push('Message is required.');

  if (errors.length > 0) {
    return res.status(400).json({
      message: 'Validation failed. Please fill in all required fields correctly.',
      errors: errors
    });
  }

  try {
    const contact = await Contact.create({ name, email, phone, message });
    res.status(201).json({
      message: 'Contact message received successfully.',
      data: contact
    });
  } catch (err) {
    res.status(400).json({
      message: 'Failed to submit contact message.',
      error: err.message
    });
  }
};


// Get all contacts
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find();
    res.status(200).json({
      message: 'Contacts retrieved successfully.',
      data: contacts
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to retrieve contacts.',
      error: err.message
    });
  }
};

// Get a single contact by ID
exports.getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    res.status(200).json({
      message: 'Contact retrieved successfully.',
      data: contact
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to retrieve contact.',
      error: err.message
    });
  }
};

// Update a contact
exports.updateContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    res.status(200).json({
      message: 'Contact updated successfully.',
      data: contact
    });
  } catch (err) {
    res.status(400).json({
      message: 'Failed to update contact.',
      error: err.message
    });
  }
};

// Delete a contact
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    res.status(200).json({
      message: 'Contact deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete contact.',
      error: err.message
    });
  }
};
