// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['general', 'class', 'exam', 'schedule', 'announcement'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Target audience
  targetAudience: {
    type: String,
    enum: ['all', 'students', 'teachers', 'specific_class'],
    required: true
  },
  // If targetAudience is 'specific_class'
  targetClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: function() {
      return this.targetAudience === 'specific_class';
    }
  },
  // File attachments
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Track who has read the notification
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Scheduling options
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ publishDate: -1 });
notificationSchema.index({ targetClass: 1, publishDate: -1 });
notificationSchema.index({ 'readBy.user': 1 });
notificationSchema.index({ expiryDate: 1 });
notificationSchema.index({ targetAudience: 1 });

// Virtual to check if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiryDate && this.expiryDate < new Date();
});

// Virtual to get read count
notificationSchema.virtual('readCount').get(function() {
  return this.readBy.length;
});

// Method to check if user has read the notification
notificationSchema.methods.hasBeenReadBy = function(userId) {
  return this.readBy.some(read => 
    read.user.toString() === userId.toString()
  );
};

// Method to mark as read by user
notificationSchema.methods.markAsRead = function(userId) {
  if (!this.hasBeenReadBy(userId)) {
    this.readBy.push({ user: userId });
  }
};

// Static method to get all notifications (for admin)
notificationSchema.statics.getAllNotifications = async function(options = {}) {
  const { page = 1, limit = 20 } = options;
  
  // Admin sees all notifications, no filtering by audience
  const query = {
    isActive: true,
    publishDate: { $lte: new Date() },
    $or: [
      { expiryDate: null },
      { expiryDate: { $gte: new Date() } }
    ]
  };
  
  const notifications = await this.find(query)
    .sort({ priority: -1, publishDate: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('targetClass', 'name grade')
    .populate('createdBy', 'name role');
    
  const total = await this.countDocuments(query);
  
  return {
    notifications,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

// Static method to get notifications for a user
notificationSchema.statics.getNotificationsForUser = async function(user, options = {}) {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  
  // Base query for active and non-expired notifications
  const query = {
    isActive: true,
    publishDate: { $lte: new Date() },
    $or: [
      { expiryDate: null },
      { expiryDate: { $gte: new Date() } }
    ]
  };

  // Check if user is admin - admins see all notifications
  if (user.role === 'admin') {

  } else {
    // Filter based on user role and target audience
    const audienceConditions = [];
    
    // All users can see 'all' notifications
    audienceConditions.push({ targetAudience: 'all' });
    
    if (user.role === 'student') {
      audienceConditions.push({ targetAudience: 'students' });
      
      // Check for student's class
      if (user.studentClass) {
        audienceConditions.push({
          targetAudience: 'specific_class',
          targetClass: user.studentClass
        });
      }
    } else if (user.role === 'teacher') {
      audienceConditions.push({ targetAudience: 'teachers' });
      
      // Teachers can see notifications for classes they teach
      if (user.teachingClasses && user.teachingClasses.length > 0) {
        const teachingClassIds = user.teachingClasses.map(tc => tc.class);
        audienceConditions.push({
          targetAudience: 'specific_class',
          targetClass: { $in: teachingClassIds }
        });
      }
    }
    
    // Apply audience filtering for non-admin users
    query.$and = [{ $or: audienceConditions }];
  }
  
  // Filter unread only if requested
  if (unreadOnly) {
    query['readBy.user'] = { $ne: user._id };
  }
  

  const notifications = await this.find(query)
    .sort({ priority: -1, publishDate: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('targetClass', 'name grade')
    .populate('createdBy', 'name role');
    
  const total = await this.countDocuments(query);
  

  
  return {
    notifications,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

// Method to get notification statistics
notificationSchema.statics.getStats = async function(userRole = null) {
  const baseMatch = {
    isActive: true,
    publishDate: { $lte: new Date() },
    $or: [
      { expiryDate: null },
      { expiryDate: { $gte: new Date() } }
    ]
  };

  // If not admin, apply audience filtering
  if (userRole && userRole !== 'admin') {
    const audienceConditions = [{ targetAudience: 'all' }];
    
    if (userRole === 'student') {
      audienceConditions.push({ targetAudience: 'students' });
    } else if (userRole === 'teacher') {
      audienceConditions.push({ targetAudience: 'teachers' });
    }
    
    baseMatch.$and = [{ $or: audienceConditions }];
  }

  const stats = await this.aggregate([
    { $match: baseMatch },
    {
      $facet: {
        byType: [
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ],
        byPriority: [
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ],
        byAudience: [
          { $group: { _id: '$targetAudience', count: { $sum: 1 } } }
        ],
        total: [
          { $count: 'count' }
        ],
        avgReadCount: [
          { $project: { readCount: { $size: '$readBy' } } },
          { $group: { _id: null, avg: { $avg: '$readCount' } } }
        ]
      }
    }
  ]);

  return {
    byType: stats[0].byType,
    byPriority: stats[0].byPriority,
    byAudience: stats[0].byAudience,
    total: stats[0].total[0]?.count || 0,
    avgReadCount: Math.round(stats[0].avgReadCount[0]?.avg || 0)
  };
};

// Pre-remove hook to clean up attachments
notificationSchema.pre('remove', async function(next) {
  // Add logic to delete files from storage (S3, local, etc.)
  // This is a placeholder - implement based on your storage solution
  console.log('Cleaning up attachments for notification:', this._id);
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);