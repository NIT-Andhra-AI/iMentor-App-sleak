const express = require('express');
const router = express.Router();
const multer = require('multer');
const courseController = require('../controllers/courseController');
const authMiddleware = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit to handle syllabus PDF sizes
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// Protect all course routes with authMiddleware
router.use(authMiddleware);

// Core CRUD APIs
router.post('/upload', upload.single('pdf'), courseController.uploadAndParseSyllabus);
router.post('/', courseController.createCourse);
router.get('/', courseController.getCourses);
router.get('/:id', courseController.getCourseById);
router.delete('/:id', courseController.deleteCourse);

// Progress and Caching APIs
router.put('/:id/subtopics/complete', courseController.toggleSubtopicCompletion);
router.put('/:id/cache-content', courseController.updateCachedContent);

// Course doubt-resolution Chat APIs
router.get('/:id/messages', courseController.getCourseMessages);
router.post('/:id/messages', courseController.addCourseMessage);

module.exports = router;
