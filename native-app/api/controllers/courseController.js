const pdfParse = require('pdf-parse');
const Course = require('../models/Course');
const CourseMessage = require('../models/CourseMessage');

// Helper function to deduplicate text (reused from ragController.js)
function deduplicateText(text) {
  if (!text) return '';
  let normalized = text.replace(/\r\n/g, '\n').replace(/ {2,}/g, ' ');
  const paragraphs = normalized.split(/\n\s*\n/);
  const uniqueParagraphs = [];
  const seenSentences = new Set();
  
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const sentences = para.split(/(?<=[.!?])\s+/);
    const uniqueSentences = [];
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      const normSentence = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normSentence.length > 15) {
        if (seenSentences.has(normSentence)) {
          continue;
        }
        seenSentences.add(normSentence);
      }
      uniqueSentences.push(trimmed);
    }
    if (uniqueSentences.length > 0) {
      uniqueParagraphs.push(uniqueSentences.join(' '));
    }
  }
  return uniqueParagraphs.join('\n\n');
}

/**
 * Uploads a syllabus PDF, parses its text, and returns the sanitized content.
 */
exports.uploadAndParseSyllabus = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (parseError) {
      console.error('Error parsing PDF text:', parseError);
      return res.status(500).json({ error: 'Failed to parse PDF text.' });
    }

    const rawText = pdfData.text || '';
    const cleanedText = deduplicateText(rawText);
    const fileName = req.file.originalname || 'syllabus.pdf';

    let markdownDoc = `# Syllabus: ${fileName}\n\n`;
    markdownDoc += cleanedText;

    return res.status(200).json({
      success: true,
      fileName,
      markdownDoc
    });
  } catch (err) {
    console.error('Syllabus parsing failed:', err);
    return res.status(500).json({ error: 'An unexpected error occurred during syllabus processing.' });
  }
};

/**
 * Creates a new Course.
 */
exports.createCourse = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      description,
      learningObjectives,
      courseOutcomes,
      prerequisites,
      knowledgeLevel,
      chapters,
      syllabusMarkdown
    } = req.body;

    if (!name || !chapters || chapters.length === 0) {
      return res.status(400).json({ error: 'Course name and chapters are required.' });
    }

    const newCourse = new Course({
      userId,
      name,
      description,
      learningObjectives: learningObjectives || [],
      courseOutcomes: courseOutcomes || [],
      prerequisites: prerequisites || [],
      knowledgeLevel: knowledgeLevel || 'Beginner',
      chapters,
      syllabusMarkdown: syllabusMarkdown || '',
      overallProgress: 0
    });

    await newCourse.save();
    res.status(201).json(newCourse);
  } catch (err) {
    console.error('Create course failed:', err);
    res.status(500).json({ error: 'Failed to create course.' });
  }
};

/**
 * Fetch all courses for the logged-in user (excludes large cached content for speed).
 */
exports.getCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const courses = await Course.find({ userId })
      .select('-cachedContent -syllabusMarkdown')
      .sort({ createdAt: -1 });
    res.status(200).json(courses);
  } catch (err) {
    console.error('Get courses failed:', err);
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
};

/**
 * Fetch a specific course by ID.
 */
exports.getCourseById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    res.status(200).json(course);
  } catch (err) {
    console.error('Get course by ID failed:', err);
    res.status(500).json({ error: 'Failed to fetch course details.' });
  }
};

/**
 * Deletes a course and all associated messages.
 */
exports.deleteCourse = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    await CourseMessage.deleteMany({ courseId: id });
    await Course.deleteOne({ _id: id });

    res.status(200).json({ message: 'Course deleted successfully.' });
  } catch (err) {
    console.error('Delete course failed:', err);
    res.status(500).json({ error: 'Failed to delete course.' });
  }
};

/**
 * Toggles a subtopic's completion status and recalculates course progress.
 */
exports.toggleSubtopicCompletion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { chapterId, topicId, subtopicId, completed, score, total } = req.body;

    if (!chapterId || !topicId || !subtopicId) {
      return res.status(400).json({ error: 'chapterId, topicId, and subtopicId are required.' });
    }

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    // 1. Locate and update the subtopic completion & quiz score
    let targetSubtopic = null;
    course.chapters.forEach(ch => {
      if (ch.id === chapterId) {
        ch.topics.forEach(tp => {
          if (tp.id === topicId) {
            tp.subtopics.forEach(sub => {
              if (sub.id === subtopicId) {
                sub.completed = !!completed;
                sub.completedAt = completed ? new Date() : null;
                if (score !== undefined && total !== undefined) {
                  sub.latestQuizScore = { score, total };
                }
                targetSubtopic = sub;
              }
            });
          }
        });
      }
    });

    if (!targetSubtopic) {
      return res.status(404).json({ error: 'Subtopic not found in this course.' });
    }

    // 2. Recalculate progress levels up the hierarchy
    let totalCourseSubtopics = 0;
    let completedCourseSubtopics = 0;

    course.chapters.forEach(ch => {
      let totalChapterSubtopics = 0;
      let completedChapterSubtopics = 0;

      ch.topics.forEach(tp => {
        let totalTopicSubtopics = 0;
        let completedTopicSubtopics = 0;

        tp.subtopics.forEach(sub => {
          totalTopicSubtopics++;
          if (sub.completed) {
            completedTopicSubtopics++;
          }
        });

        // Update Topic Progress
        tp.progress = totalTopicSubtopics > 0 
          ? Math.round((completedTopicSubtopics / totalTopicSubtopics) * 100) 
          : 0;

        totalChapterSubtopics += totalTopicSubtopics;
        completedChapterSubtopics += completedTopicSubtopics;
      });

      // Update Chapter Progress
      ch.progress = totalChapterSubtopics > 0 
        ? Math.round((completedChapterSubtopics / totalChapterSubtopics) * 100) 
        : 0;

      totalCourseSubtopics += totalChapterSubtopics;
      completedCourseSubtopics += completedChapterSubtopics;
    });

    // Update Overall Course Progress
    course.overallProgress = totalCourseSubtopics > 0 
      ? Math.round((completedCourseSubtopics / totalCourseSubtopics) * 100) 
      : 0;

    await course.save();
    res.status(200).json(course);
  } catch (err) {
    console.error('Toggle subtopic completion failed:', err);
    res.status(500).json({ error: 'Failed to update progress.' });
  }
};

/**
 * Caches explanations/quizzes for specific subtopics to reduce future LLM calls.
 */
exports.updateCachedContent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { subtopicKey, content } = req.body; // subtopicKey is "chapterId:topicId:subtopicId"

    if (!subtopicKey || !content) {
      return res.status(400).json({ error: 'subtopicKey and content are required.' });
    }

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    // Update content key map
    course.cachedContent.set(subtopicKey, content);
    await course.save();

    res.status(200).json({ success: true, cachedContent: course.cachedContent });
  } catch (err) {
    console.error('Update cached content failed:', err);
    res.status(500).json({ error: 'Failed to cache content.' });
  }
};

/**
 * Gets message history for a specific course chat
 */
exports.getCourseMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    const messages = await CourseMessage.find({ courseId: id }).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (err) {
    console.error('Get course messages failed:', err);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
};

/**
 * Adds a user/assistant message in the course chat
 */
exports.addCourseMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { role, content, chapterId, topicId, subtopicId } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required.' });
    }

    const course = await Course.findOne({ _id: id, userId });
    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized.' });
    }

    const newMessage = new CourseMessage({
      userId,
      courseId: id,
      role,
      content,
      chapterId,
      topicId,
      subtopicId
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (err) {
    console.error('Add course message failed:', err);
    res.status(500).json({ error: 'Failed to add message.' });
  }
};
