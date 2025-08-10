// controllers/gradeController.js
const Grade = require('../models/Grade');
const User = require('../models/User');
const Class = require('../models/Class');
const School = require('../models/School');

// Create grade (Teacher only)
const createGrade = async (req, res) => {
  try {
    const {
      studentId,
      classId,
      subjectId,
      examName,
      examType,
      grade,
      coefficient,
      examDate,
      trimester,
      academicYear,
      comments
    } = req.body;
    
    const teacherId = req.userId;

    // Validate grade is between 0 and 20
    if (grade < 0 || grade > 20) {
      return res.status(400).json({ 
        message: 'La note doit être entre 0 et 20' 
      });
    }

    // Removed the validation for half points - now accepts any decimal
    // if (grade % 0.5 !== 0) {
    //   return res.status(400).json({ 
    //     message: 'La note doit être un nombre entier ou demi-point (ex: 15 ou 15.5)' 
    //   });
    // }

    // Get school
    const school = await School.findOne();
    if (!school) {
      return res.status(400).json({ message: 'Aucune école trouvée' });
    }

    // Verify teacher teaches this subject in this class
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Classe non trouvée' });
    }

    const teacherEntry = classData.teacherSubjects.find(
      ts => ts.teacher.toString() == teacherId && 
           ts.subjects.some(s => s.toString() == subjectId)
    );

    if (!teacherEntry) {
      return res.status(403).json({ 
        message: 'Vous n\'enseignez pas cette matière dans cette classe' 
      });
    }

    // Verify student belongs to the class
    const student = await User.findById(studentId);
    if (!student || student.role != 'student' || 
        student.studentClass?.toString() != classId) {
      return res.status(400).json({ 
        message: 'Élève non trouvé ou n\'appartient pas à cette classe' 
      });
    }

    // Check if grade already exists for this exam
    const existingGrade = await Grade.findOne({
      student: studentId,
      class: classId,
      subject: subjectId,
      examName,
      examType,
      trimester,
      academicYear: academicYear || new Date().getFullYear().toString()
    });

    if (existingGrade) {
      return res.status(400).json({ 
        message: 'Une note existe déjà pour cet élève et cet examen' 
      });
    }

    // Create grade
    const newGrade = new Grade({
      student: studentId,
      class: classId,
      subject: subjectId,
      teacher: teacherId,
      examName,
      examType,
      grade,
      coefficient: coefficient || 1,
      examDate: examDate || new Date(),
      trimester,
      academicYear: academicYear || new Date().getFullYear().toString(),
      comments,
      school: school._id
    });

    const savedGrade = await newGrade.save();

    res.status(201).json({
      message: 'Note créée avec succès',
      grade: savedGrade
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get grades by student
const getGradesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear, trimester, subject } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    // Students can only see their own grades
    if (userRole == 'student' && studentId != userId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    // Teachers can only see grades from their classes
    if (userRole == 'teacher') {
      const student = await User.findById(studentId);
      if (!student || !student.studentClass) {
        return res.status(404).json({ message: 'Élève non trouvé' });
      }

      const classData = await Class.findById(student.studentClass);
      const teachesStudent = classData.teacherSubjects.some(
        ts => ts.teacher.toString() == userId
      );

      if (!teachesStudent) {
        return res.status(403).json({ message: 'Accès refusé' });
      }
    }

    let filter = { student: studentId };
    if (academicYear) filter.academicYear = academicYear;
    if (trimester) filter.trimester = trimester;
    if (subject) filter.subject = subject;

    const grades = await Grade.find(filter)
      .populate('subject', 'name')
      .populate('class', 'name grade')
      .populate('teacher', 'name')
      .sort({ examDate: -1 });

    // Calculate statistics
    const stats = {
      totalGrades: grades.length,
      moyenneGenerale: 0,
      moyenneParMatiere: {}
    };

    // Calculate weighted average
    let totalWeightedGrades = 0;
    let totalCoefficients = 0;

    // Group by subject for subject averages
    const subjectGroups = {};
    
    grades.forEach(gradeDoc => {
      const subjectName = gradeDoc.subject.name;
      if (!subjectGroups[subjectName]) {
        subjectGroups[subjectName] = {
          grades: [],
          totalWeighted: 0,
          totalCoef: 0
        };
      }
      subjectGroups[subjectName].grades.push(gradeDoc);
      subjectGroups[subjectName].totalWeighted += gradeDoc.grade * gradeDoc.coefficient;
      subjectGroups[subjectName].totalCoef += gradeDoc.coefficient;
      
      totalWeightedGrades += gradeDoc.grade * gradeDoc.coefficient;
      totalCoefficients += gradeDoc.coefficient;
    });

    // Calculate averages
    if (totalCoefficients > 0) {
      stats.moyenneGenerale = Math.round((totalWeightedGrades / totalCoefficients) * 100) / 100;
    }

    Object.keys(subjectGroups).forEach(subject => {
      const group = subjectGroups[subject];
      stats.moyenneParMatiere[subject] = {
        moyenne: Math.round((group.totalWeighted / group.totalCoef) * 100) / 100,
        nombreNotes: group.grades.length
      };
    });

    res.status(200).json({
      grades,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get grades by class
const getGradesByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYear, trimester, subject, examType } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    // Verify access
    if (userRole == 'teacher') {
      const classData = await Class.findById(classId);
      const teachesClass = classData.teacherSubjects.some(
        ts => ts.teacher.toString() == userId
      );
      if (!teachesClass) {
        return res.status(403).json({ message: 'Accès refusé' });
      }
    }

    if (userRole == 'student') {
      const student = await User.findById(userId);
      if (!student.studentClass || student.studentClass.toString() != classId) {
        return res.status(403).json({ message: 'Accès refusé' });
      }
    }

    let filter = { class: classId };
    if (academicYear) filter.academicYear = academicYear;
    if (trimester) filter.trimester = trimester;
    if (subject) filter.subject = subject;
    if (examType) filter.examType = examType;

    const grades = await Grade.find(filter)
      .populate('student', 'name email')
      .populate('subject', 'name')
      .populate('teacher', 'name')
      .sort({ examDate: -1, 'student.name': 1 });

    res.status(200).json({
      grades,
      total: grades.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Update grade (Teacher only)
const updateGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;
    const { grade, comments } = req.body;
    const teacherId = req.userId;

    const gradeDoc = await Grade.findById(gradeId);
    if (!gradeDoc) {
      return res.status(404).json({ message: 'Note non trouvée' });
    }

    // Check if teacher owns this grade
    if (gradeDoc.teacher.toString() != teacherId) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres notes' });
    }

    // Validate new grade if provided
    if (grade !== undefined) {
      if (grade < 0 || grade > 20) {
        return res.status(400).json({ 
          message: 'La note doit être entre 0 et 20' 
        });
      }
      // Removed the half-point validation
      // if (grade % 0.5 != 0) {
      //   return res.status(400).json({ 
      //     message: 'La note doit être un nombre entier ou demi-point' 
      //   });
      // }
      gradeDoc.grade = grade;
    }
    
    if (comments !== undefined) gradeDoc.comments = comments;

    const updatedGrade = await gradeDoc.save();

    res.status(200).json({
      message: 'Note mise à jour avec succès',
      grade: updatedGrade
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Delete grade (Teacher only)
const deleteGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;
    const teacherId = req.userId;

    const grade = await Grade.findById(gradeId);
    if (!grade) {
      return res.status(404).json({ message: 'Note non trouvée' });
    }

    // Check if teacher owns this grade
    if (grade.teacher.toString() != teacherId) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres notes' });
    }

    await Grade.findByIdAndDelete(gradeId);

    res.status(200).json({ message: 'Note supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Get student report card (bulletin)
const getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear, trimester } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    // Access control
    if (userRole == 'student' && studentId != userId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const student = await User.findById(studentId)
      .populate('studentClass', 'name grade');

    if (!student) {
      return res.status(404).json({ message: 'Élève non trouvé' });
    }

    let filter = { student: studentId };
    if (academicYear) filter.academicYear = academicYear;
    if (trimester) filter.trimester = trimester;

    const grades = await Grade.find(filter)
      .populate('subject', 'name')
      .populate('teacher', 'name')
      .sort({ subject: 1, examDate: 1 });

    // Group grades by subject
    const gradesBySubject = {};
    grades.forEach(grade => {
      const subjectId = grade.subject._id.toString();
      if (!gradesBySubject[subjectId]) {
        gradesBySubject[subjectId] = {
          subject: grade.subject,
          grades: [],
          moyenne: 0,
          totalWeighted: 0,
          totalCoef: 0,
          appreciation: ''
        };
      }
      gradesBySubject[subjectId].grades.push(grade);
      gradesBySubject[subjectId].totalWeighted += grade.grade * grade.coefficient;
      gradesBySubject[subjectId].totalCoef += grade.coefficient;
    });

    // Calculate subject averages and appreciation
    let totalGeneralWeighted = 0;
    let totalGeneralCoef = 0;

    Object.keys(gradesBySubject).forEach(subjectId => {
      const subjectData = gradesBySubject[subjectId];
      subjectData.moyenne = Math.round((subjectData.totalWeighted / subjectData.totalCoef) * 100) / 100;
      
      // Set appreciation based on average
      if (subjectData.moyenne >= 18) subjectData.appreciation = 'Excellent';
      else if (subjectData.moyenne >= 16) subjectData.appreciation = 'Très Bien';
      else if (subjectData.moyenne >= 14) subjectData.appreciation = 'Bien';
      else if (subjectData.moyenne >= 12) subjectData.appreciation = 'Assez Bien';
      else if (subjectData.moyenne >= 10) subjectData.appreciation = 'Passable';
      else if (subjectData.moyenne >= 6) subjectData.appreciation = 'Insuffisant';
      else subjectData.appreciation = 'Très Insuffisant';

      totalGeneralWeighted += subjectData.totalWeighted;
      totalGeneralCoef += subjectData.totalCoef;
    });

    const moyenneGenerale = totalGeneralCoef > 0 
      ? Math.round((totalGeneralWeighted / totalGeneralCoef) * 100) / 100 
      : 0;

    let appreciationGenerale = '';
    if (moyenneGenerale >= 18) appreciationGenerale = 'Excellent';
    else if (moyenneGenerale >= 16) appreciationGenerale = 'Très Bien';
    else if (moyenneGenerale >= 14) appreciationGenerale = 'Bien';
    else if (moyenneGenerale >= 12) appreciationGenerale = 'Assez Bien';
    else if (moyenneGenerale >= 10) appreciationGenerale = 'Passable';
    else if (moyenneGenerale >= 6) appreciationGenerale = 'Insuffisant';
    else appreciationGenerale = 'Très Insuffisant';

    res.status(200).json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        class: student.studentClass
      },
      bulletin: {
        academicYear: academicYear || new Date().getFullYear().toString(),
        trimester: trimester || 'Tous les trimestres',
        matieres: Object.values(gradesBySubject),
        moyenneGenerale,
        appreciationGenerale,
        totalNotes: grades.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

module.exports = {
  createGrade,
  getGradesByStudent,
  getGradesByClass,
  updateGrade,
  deleteGrade,
  getStudentReport
};