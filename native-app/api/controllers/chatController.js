const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Server error fetching conversations' });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;
    
    const newConv = new Conversation({
      userId,
      title: title || 'New Conversation'
    });
    
    await newConv.save();
    res.status(201).json(newConv);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ message: 'Server error creating conversation' });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found or unauthorized' });
    }
    
    await Message.deleteMany({ conversationId: id });
    await Conversation.deleteOne({ _id: id });
    
    res.status(200).json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ message: 'Server error deleting conversation' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found or unauthorized' });
    }
    
    const messages = await Message.find({ conversationId: id }).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { role, content } = req.body;
    
    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found or unauthorized' });
    }
    
    const newMessage = new Message({
      conversationId: id,
      role,
      content
    });
    
    await newMessage.save();
    
    // Update conversation title if it's the first user message
    if (conversation.title === 'New Conversation' && role === 'user') {
      const words = content.trim().split(/\s+/).filter(Boolean);
      conversation.title = words.length <= 5 ? content.trim() : `${words.slice(0, 5).join(' ')}...`;
    }
    conversation.updatedAt = new Date();
    await conversation.save();
    
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ message: 'Server error adding message' });
  }
};
