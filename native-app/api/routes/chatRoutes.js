const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

// All chat routes are protected
router.use(authMiddleware);

router.get('/conversations', chatController.getConversations);
router.post('/conversations', chatController.createConversation);
router.delete('/conversations/:id', chatController.deleteConversation);

router.get('/conversations/:id/messages', chatController.getMessages);
router.post('/conversations/:id/messages', chatController.addMessage);

module.exports = router;
