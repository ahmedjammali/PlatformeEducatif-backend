// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const {
  createChat,
  getStudentChats,
  getChat,
  sendMessage,
  updateChatTitle,
  deleteChat
} = require('../controllers/chatController');
const { authenticate, isStudent } = require('../middleware/auth');

router.use(authenticate, isStudent);

// Create a new chat session
router.post('/', createChat);

// Get all chats for the authenticated student
router.get('/', getStudentChats);

// Get a specific chat with messages
router.get('/:chatId', getChat);

// Send a message to AI in a specific chat
router.post('/:chatId/message', sendMessage);

// Update chat title
router.patch('/:chatId/title', updateChatTitle);

// Delete a chat (soft delete)
router.delete('/:chatId', deleteChat);

module.exports = router;