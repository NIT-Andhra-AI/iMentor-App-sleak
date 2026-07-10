const mongoose = require('mongoose');

const courseMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  chapterId: { type: String },
  topicId: { type: String },
  subtopicId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('CourseMessage', courseMessageSchema);
