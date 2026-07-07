const express = require('express');
const router = express.Router();
const multer = require('multer');
const ragController = require('../controllers/ragController');
const authMiddleware = require('../middleware/authMiddleware');

// Set up memory storage for uploaded PDFs
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit to handle textbook-size PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// Protect all RAG routes with authMiddleware
router.use(authMiddleware);

// Upload PDF and parse text + save in DB
router.post('/upload', upload.single('pdf'), ragController.uploadAndProcessPdf);

// History & CRUD APIs for RAG documents and conversations
router.get('/documents', ragController.getDocuments);
router.delete('/documents/:id', ragController.deleteDocument);
router.get('/documents/:id/messages', ragController.getMessages);
router.post('/documents/:id/messages', ragController.addMessage);

module.exports = router;
