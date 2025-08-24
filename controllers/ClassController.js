// controllers/classController.js
const Class = require('../models/Class');
const User = require('../models/User');
const School = require('../models/School');
const Exercise = require('../models/Exercise');
const StudentProgress = require('../models/StudentProgress');
const Grade = require('../models/Grade');

// Create a new class
const createClass = async (req, res) => {
  try {
    const { name, grade, academicYear } = req.body;
    const creatorId = req.userId;

    // Get the school
    const school = await School.findOne();
    if (!school) {
      return res.status(400).json({ message: 'No school found' });
    }

    const newClass = new Class({
      name,
      grade,
      school: school._id,
      academicYear: academicYear || new Date().getFullYear().toString(),
      createdBy: creatorId
    });

    const savedClass = await newClass.save();

    res.status(201).json({
      message: 'Class created successfully',
      class: savedClass
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all classes
const getAllClasses = async (req, res) => {
  try {
    const { page = 1, limit = 100, grade, academicYear } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    let filter = {};

    // Get the school
    const school = await School.findOne();
    if (!school) {
      return res.status(400).json({ message: 'No school found' });
    }
    
    filter.school = school._id;

    // Additional filters
    if (grade) filter.grade = grade;
    if (academicYear) filter.academicYear = academicYear;

    // For teachers, only show classes they teach
    if (userRole === 'teacher') {
      filter['teacherSubjects.teacher'] = userId;
    }

    // For students, only show their class
    if (userRole === 'student') {
      const student = await User.findById(userId);
      if (student.studentClass) {
        filter._id = student.studentClass;
      } else {
        return res.status(200).json({ classes: [], pagination: {} });
      }
    }

    const skip = (page - 1) * limit;

    const classes = await Class.find(filter)
      .populate('teacherSubjects.teacher', 'name email')
      .populate('teacherSubjects.subjects', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Class.countDocuments(filter);

    res.status(200).json({
      classes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalClasses: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class by ID
const getClassById = async (req, res) => {
  try {
    const { classId } = req.params;

    const classData = await Class.findById(classId)
      .populate('teacherSubjects.teacher', 'name email')
      .populate('teacherSubjects.subjects', 'name description')
      .populate('students', 'name email')
      .populate('school', 'name')
      .populate('createdBy', 'name');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get class statistics
    const [totalExercises, totalStudents] = await Promise.all([
      Exercise.countDocuments({ class: classId }),
      User.countDocuments({ studentClass: classId, role: 'student' })
    ]);

    res.status(200).json({
      class: classData,
      statistics: {
        totalExercises,
        totalStudents,
        totalTeachers: classData.teacherSubjects.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update class
const updateClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates.school;
    delete updates.createdBy;
    delete updates.students; // Students should be managed through separate endpoints

    const updatedClass = await Class.findByIdAndUpdate(
      classId,
      updates,
      { new: true, runValidators: true }
    )
    .populate('teacherSubjects.teacher', 'name email')
    .populate('teacherSubjects.subjects', 'name');

    if (!updatedClass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.status(200).json({
      message: 'Class updated successfully',
      class: updatedClass
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete class
const deleteClass = async (req, res) => {
  try {
    const { classId } = req.params;

    const classToDelete = await Class.findById(classId);
    if (!classToDelete) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Remove class from all teachers' teachingClasses
    await User.updateMany(
      { 'teachingClasses.class': classId },
      { $pull: { teachingClasses: { class: classId } } }
    );

    // Remove class from all students
    await User.updateMany(
      { studentClass: classId },
      { $unset: { studentClass: 1 } }
    );

    // Delete all exercises for this class
    await Exercise.deleteMany({ class: classId });

    // Delete all student progress for this class
    await StudentProgress.deleteMany({ class: classId });

    // Delete the class
    await Class.findByIdAndDelete(classId);

    res.status(200).json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add student to class
const addStudentToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentId } = req.body;

    const [classData, student] = await Promise.all([
      Class.findById(classId),
      User.findById(studentId)
    ]);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student belongs to the same school
    if (student.school.toString() !== classData.school.toString()) {
      return res.status(400).json({ 
        message: 'Student must belong to the same school as the class' 
      });
    }

    // Update student's class
    student.studentClass = classId;
    await student.save();

    // Add student to class
    if (!classData.students.includes(studentId)) {
      classData.students.push(studentId);
      await classData.save();
    }

    res.status(200).json({
      message: 'Student added to class successfully',
      class: await classData.populate('students', 'name email')
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Remove student from class
const removeStudentFromClass = async (req, res) => {
  try {
    const { classId, studentId } = req.params;

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Remove student from class
    classData.students = classData.students.filter(
      s => s.toString() !== studentId
    );
    await classData.save();

    // Remove class from student
    await User.findByIdAndUpdate(studentId, { $unset: { studentClass: 1 } });

    res.status(200).json({
      message: 'Student removed from class successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Assign teacher to subjects in a class
const assignTeacherToSubjects = async (req, res) => {
  try {
    const { classId } = req.params;
    const { teacherId, subjectIds } = req.body;

    const [classData, teacher] = await Promise.all([
      Class.findById(classId),
      User.findById(teacherId)
    ]);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teacher belongs to the same school
    if (teacher.school.toString() !== classData.school.toString()) {
      return res.status(400).json({ 
        message: 'Teacher must belong to the same school as the class' 
      });
    }

    // Add or update teacher in class
    classData.addTeacher(teacherId, subjectIds);
    await classData.save();

    // Update teacher's teachingClasses
    const existingIndex = teacher.teachingClasses.findIndex(
      tc => tc.class.toString() === classId
    );

    if (existingIndex > -1) {
      teacher.teachingClasses[existingIndex].subjects = subjectIds;
    } else {
      teacher.teachingClasses.push({
        class: classId,
        subjects: subjectIds
      });
    }
    await teacher.save();

    res.status(200).json({
      message: 'Teacher assigned to subjects successfully',
      class: await classData.populate('teacherSubjects.teacher teacherSubjects.subjects')
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Remove teacher from class
const removeTeacherFromClass = async (req, res) => {
  try {
    const { classId, teacherId } = req.params;

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Remove teacher from class
    classData.teacherSubjects = classData.teacherSubjects.filter(
      ts => ts.teacher.toString() !== teacherId
    );
    await classData.save();

    // Remove class from teacher's teachingClasses
    await User.findByIdAndUpdate(
      teacherId,
      { $pull: { teachingClasses: { class: classId } } }
    );

    res.status(200).json({
      message: 'Teacher removed from class successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class students
const getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const skip = (page - 1) * limit;

    const students = await User.find({
      studentClass: classId,
      role: 'student'
    })
    .select('name email createdAt lastLogin')
    .sort({ name: 1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await User.countDocuments({
      studentClass: classId,
      role: 'student'
    });

    res.status(200).json({
      students,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStudents: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get class teachers
const getClassTeachers = async (req, res) => {
  try {
    const { classId } = req.params;

    const classData = await Class.findById(classId)
      .populate('teacherSubjects.teacher', 'name email')
      .populate('teacherSubjects.subjects', 'name');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const teachers = classData.teacherSubjects.map(ts => ({
      teacher: ts.teacher,
      subjects: ts.subjects
    }));

    res.status(200).json({ teachers });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// Get student's current class with subjects
const getStudentClass = async (req, res) => {
  try {
    const studentId = req.userId;
    
    // Get student with populated class
    const student = await User.findById(studentId)
      .populate({
        path: 'studentClass',
        populate: {
          path: 'teacherSubjects.subjects',
          select: 'name description imagePath'
        }
      });

    if (!student || !student.studentClass) {
      return res.status(404).json({ 
        message: 'You are not assigned to any class' 
      });
    }

    // Extract unique subjects from all teachers
    const subjectsMap = new Map();
    student.studentClass.teacherSubjects.forEach(ts => {
      ts.subjects.forEach(subject => {
        if (!subjectsMap.has(subject._id.toString())) {
          subjectsMap.set(subject._id.toString(), {
            _id: subject._id,
            name: subject.name,
            description: subject.description,
            imagePath: subject.imagePath
          });
        }
      });
    });

    const subjects = Array.from(subjectsMap.values());

    res.status(200).json({
      class: {
        _id: student.studentClass._id,
        name: student.studentClass.name,
        grade: student.studentClass.grade,
        academicYear: student.studentClass.academicYear
      },
      subjects
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createClass,
  getAllClasses,
  getClassById,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  assignTeacherToSubjects,
  removeTeacherFromClass,
  getClassStudents,
  getClassTeachers,
  getStudentClass
};