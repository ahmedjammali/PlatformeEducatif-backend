const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Grade = require('../models/Grade');

// Create a new subject (Admin only)
const createSubject = async (req, res) => {
  try {
    const { name, description, imagePath } = req.body;

    // Check if subject already exists
    const existingSubject = await Subject.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingSubject) {
      return res.status(400).json({ 
        message: 'Subject with this name already exists' 
      });
    }

    const subject = new Subject({
      name,
      description,
      imagePath
    });

    const savedSubject = await subject.save();

    res.status(201).json({
      message: 'Subject created successfully',
      subject: savedSubject
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all subjects
const getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find().sort({ name: 1 });

    res.status(200).json({
      subjects,
      total: subjects.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get subject by ID
const getSubjectById = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Get statistics - how many classes use this subject
    const classesUsingSubject = await Class.countDocuments({
      'teacherSubjects.subjects': subjectId
    });

    res.status(200).json({
      subject,
      statistics: {
        classesUsingSubject
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update subject (Admin only)
const updateSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const updates = req.body;

    // Check if updating name to an existing subject
    if (updates.name) {
      const existingSubject = await Subject.findOne({ 
        name: { $regex: new RegExp(`^${updates.name}$`, 'i') },
        _id: { $ne: subjectId }
      });
      
      if (existingSubject) {
        return res.status(400).json({ 
          message: 'Subject with this name already exists' 
        });
      }
    }

    const updatedSubject = await Subject.findByIdAndUpdate(
      subjectId,
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedSubject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.status(200).json({
      message: 'Subject updated successfully',
      subject: updatedSubject
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


const deleteSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;

    // Check if subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }


    const deletedGradesResult = await Grade.deleteMany({ subject: subjectId });
    
    // Also remove the subject from any classes that reference it
    await Class.updateMany(
      { 'teacherSubjects.subjects': subjectId },
      { $pull: { 'teacherSubjects.$[].subjects': subjectId } }
    );

    // Now delete the subject
    const deletedSubject = await Subject.findByIdAndDelete(subjectId);

    res.status(200).json({ 
      message: 'Subject deleted successfully',
      deletedGrades: deletedGradesResult.deletedCount,
      subject: deletedSubject
    });

    

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject
};