// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/Notification');
const { 
  authenticate, 
  authorize, 
  isTeacherOrHigher,
  isAdminOrHigher,
  belongsToSameSchool 
} = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Create a new notification (admin and teachers only)
router.post('/',
  isTeacherOrHigher,
  notificationController.createNotification
);

// Get all notifications for the current user
router.get('/',
  notificationController.getNotifications
);

// Get notification statistics (admin only)
router.get('/stats',
  isAdminOrHigher,
  notificationController.getNotificationStats
);

// Get a single notification
router.get('/:id',
  notificationController.getNotification
);

// Download attachment
router.get('/:id/attachments/:filename/download',
  notificationController.downloadAttachment
);

// View attachment (inline)
router.get('/:id/attachments/:filename',
  notificationController.viewAttachment
);

// Mark notification as read
router.patch('/:id/read',
  notificationController.markAsRead
);

// Update a notification (admin and creator teacher only)
router.put('/:id',
  isTeacherOrHigher,
  notificationController.updateNotification
);

// Delete a notification (admin only)
router.delete('/:id',
  isTeacherOrHigher,
  notificationController.deleteNotification
);

module.exports = router;

