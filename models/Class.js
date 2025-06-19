// models/Class.js
const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  grade: {
    type: String,
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  // Teachers can teach different subjects in the same class
  teacherSubjects: [{
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    subjects: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    }]
  }],
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  academicYear: {
    type: String,
    required: true
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

// Indexes
classSchema.index({ school: 1, academicYear: 1 });
classSchema.index({ 'teacherSubjects.teacher': 1 });

// Method to add a teacher with subjects
classSchema.methods.addTeacher = function(teacherId, subjectIds) {
  const existingTeacher = this.teacherSubjects.find(
    ts => ts.teacher.toString() === teacherId.toString()
  );
  
  if (existingTeacher) {
    // Add new subjects to existing teacher
    const newSubjects = subjectIds.filter(
      id => !existingTeacher.subjects.includes(id)
    );
    existingTeacher.subjects.push(...newSubjects);
  } else {
    // Add new teacher with subjects
    this.teacherSubjects.push({
      teacher: teacherId,
      subjects: subjectIds
    });
  }
};

// Method to get subjects for a specific teacher
classSchema.methods.getTeacherSubjects = function(teacherId) {
  const teacherEntry = this.teacherSubjects.find(
    ts => ts.teacher.toString() === teacherId.toString()
  );
  return teacherEntry ? teacherEntry.subjects : [];
};

module.exports = mongoose.model('Class', classSchema);