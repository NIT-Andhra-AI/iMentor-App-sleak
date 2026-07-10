const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  learningObjectives: [{ type: String }],
  courseOutcomes: [{ type: String }],
  prerequisites: [{ type: String }],
  knowledgeLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  overallProgress: { type: Number, default: 0 },
  syllabusMarkdown: { type: String },
  
  // Tree Nodes: Course ➔ Chapter ➔ Topic ➔ Subtopic
  chapters: [{
    id: { type: String, required: true },
    title: { type: String, required: true },
    progress: { type: Number, default: 0 },
    topics: [{
      id: { type: String, required: true },
      title: { type: String, required: true },
      progress: { type: Number, default: 0 },
      subtopics: [{
        id: { type: String, required: true },
        title: { type: String, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        latestQuizScore: {
          score: { type: Number, default: null },
          total: { type: Number, default: null }
        }
      }]
    }]
  }],
  
  // Cached Socratic Explanations and Quizzes
  // Key format: "chapterId:topicId:subtopicId"
  cachedContent: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
