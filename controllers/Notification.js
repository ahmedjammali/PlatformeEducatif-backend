// controllers/notificationController.js
const Notification = require('../models/Notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'notifications');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedOriginalName);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow pdf, excel, and image files
  const allowedMimes = [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Excel, and image files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
}).array('attachments', 5); // Max 5 files

// Create a new notification
exports.createNotification = async (req, res) => {
  try {
    // Handle file upload
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const {
      title,
      content,
      type,
      priority,
      targetAudience,
      targetClass,
      publishDate,
      expiryDate
    } = req.body;

    // Validation
    if (!title || !content || !targetAudience) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and target audience are required'
      });
    }

    // Check permissions
    if (req.userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot create notifications'
      });
    }

    // Teachers can only create notifications for their classes
    if (req.userRole == 'teacher' && targetAudience == 'specific_class') {

      
      const teachingClassIds = req.user.teachingClasses.map(tc => tc.class.toString());
      if (!teachingClassIds.includes(targetClass)) {
        return res.status(403).json({
          success: false,
          message: 'You can only create notifications for classes you teach'
        });
      }
    }

    // Prepare notification data
    const notificationData = {
      title,
      content,
      type: type || 'general',
      priority: priority || 'medium',
      targetAudience,
      createdBy: req.userId
    };

    if (targetAudience === 'specific_class') {
      notificationData.targetClass = targetClass;
    }

    if (publishDate) {
      notificationData.publishDate = new Date(publishDate);
    }

    if (expiryDate) {
      notificationData.expiryDate = new Date(expiryDate);
    }

    // Handle attachments
    if (req.files && req.files.length > 0) {
      notificationData.attachments = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/notifications/${file.filename}`
      }));
    }

    const notification = new Notification(notificationData);
    await notification.save();

    await notification.populate([
      { path: 'targetClass', select: 'name grade' },
      { path: 'createdBy', select: 'name role' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });

  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating notification'
    });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      unreadOnly = false,
      type,
      priority,
      status,
      search
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    };

    // Use the updated method that handles admin users
    const result = await Notification.getNotificationsForUser(req.user, options);

    // Apply additional filters if provided
    let { notifications } = result;
    
    if (type) {
      notifications = notifications.filter(n => n.type === type);
    }
    
    if (priority) {
      notifications = notifications.filter(n => n.priority === priority);
    }
    
    if (status === 'active') {
      notifications = notifications.filter(n => !n.isExpired);
    } else if (status === 'expired') {
      notifications = notifications.filter(n => n.isExpired);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      notifications = notifications.filter(n => 
        n.title.toLowerCase().includes(searchLower) || 
        n.content.toLowerCase().includes(searchLower)
      );
    }

    // Add read status for each notification
    const notificationsWithReadStatus = notifications.map(notification => {
      const notificationObj = notification.toObject();
      notificationObj.isRead = notification.hasBeenReadBy(req.user._id);
      return notificationObj;
    });

    res.json({
      success: true,
      notifications: notificationsWithReadStatus,
      pagination: {
        total: result.total,
        pages: result.pages,
        currentPage: result.currentPage,
        limit: options.limit
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// Get notification statistics
exports.getNotificationStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    const stats = await Notification.getStats(userRole);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics',
      error: error.message
    });
  }
};


// Get a single notification
exports.getNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id)
      .populate('targetClass', 'name grade')
      .populate('createdBy', 'name role');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user has access to this notification
    const hasAccess = await checkUserAccessToNotification(req.user, notification);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this notification'
      });
    }

    // Mark as read
    notification.markAsRead(req.user._id);
    await notification.save();

    const notificationObj = notification.toObject();
    notificationObj.isRead = true;

    res.json({
      success: true,
      notification: notificationObj
    });

  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification'
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check access
    const hasAccess = await checkUserAccessToNotification(req.user, notification);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this notification'
      });
    }

    notification.markAsRead(req.user._id);
    await notification.save();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
};

// Update notification (admin/teacher only)
exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check permissions
    if (req.userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot update notifications'
      });
    }

    // Only creator or admin can update
    if (req.userRole === 'teacher' && 
        notification.createdBy.toString() !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update notifications you created'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['title', 'content', 'type', 'priority', 'expiryDate', 'isActive'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        notification[field] = updates[field];
      }
    });

    await notification.save();
    await notification.populate([
      { path: 'targetClass', select: 'name grade' },
      { path: 'createdBy', select: 'name role' }
    ]);

    res.json({
      success: true,
      message: 'Notification updated successfully',
      notification
    });

  } catch (error) {
    console.error('Update notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification'
    });
  }
};

// Delete notification (admin only)
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }


    // Delete associated files
    if (notification.attachments && notification.attachments.length > 0) {
      for (const attachment of notification.attachments) {
        const filePath = path.join('uploads', 'notifications', attachment.filename);
        try {
          await fs.unlink(filePath);
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
    }

    await Notification.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification'
    });
  }
};

// Get notification statistics (admin only)
exports.getNotificationStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can view notification statistics'
      });
    }

    const stats = await Notification.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byType: {
            $push: {
              type: '$type',
              priority: '$priority'
            }
          },
          avgReadCount: { $avg: { $size: '$readBy' } }
        }
      }
    ]);

    const typeStats = await Notification.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const priorityStats = await Notification.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      stats: {
        total: stats[0]?.total || 0,
        avgReadCount: Math.round(stats[0]?.avgReadCount || 0),
        byType: typeStats,
        byPriority: priorityStats
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics'
    });
  }
};

// Download attachment
exports.downloadAttachment = async (req, res) => {
  try {
    const { id, filename } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check access
    const hasAccess = await checkUserAccessToNotification(req.user, notification);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this notification'
      });
    }

    // Find the attachment
    const attachment = notification.attachments.find(att => att.filename === filename);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // Construct file path
    const filePath = path.join(process.cwd(), 'uploads', 'notifications', attachment.filename);

    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', attachment.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    res.setHeader('Content-Length', attachment.size);

    // Send file
    res.sendFile(filePath);

  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading attachment'
    });
  }
};

// Serve attachment (for inline viewing)
exports.viewAttachment = async (req, res) => {
  try {
    const { id, filename } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check access
    const hasAccess = await checkUserAccessToNotification(req.user, notification);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this notification'
      });
    }

    // Find the attachment
    const attachment = notification.attachments.find(att => att.filename === filename);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // Construct file path
    const filePath = path.join(process.cwd(), 'uploads', 'notifications', attachment.filename);

    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Set appropriate headers for inline viewing
    res.setHeader('Content-Type', attachment.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);

    // Send file
    res.sendFile(filePath);

  } catch (error) {
    console.error('View attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error viewing attachment'
    });
  }
};

// Helper function to check user access to notification
async function checkUserAccessToNotification(user, notification) {
  // Check based on target audience
  if (notification.targetAudience === 'all') {
    return true;
  }

  if (notification.targetAudience == 'students' && user.role == 'student') {
    return true;
  }

  if (notification.targetAudience == 'teachers' && user.role == 'teacher') {
    return true;
  }

  if (notification.targetAudience == 'specific_class') {

    if (user.role == 'student' && 
        user.studentClass._id.toString() == notification.targetClass.toString()) {

      return true;
    }
    
    if (user.role == 'teacher') {
      const teachingClassIds = user.teachingClasses.map(tc => tc.class.toString());
      return teachingClassIds.includes(notification.targetClass.toString());
    }
  }

  // Admins can see all notifications
  if (user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }

  return false;
}

module.exports = exports;