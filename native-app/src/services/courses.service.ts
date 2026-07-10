import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { useAuthStore } from '../store/authStore';
import { useCoursesStore } from '../store/courses.store';
import { Course, CourseMessage } from '../types/courses.types';
import { getApiBaseUrl } from './rag.service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const coursesService = {
  /**
   * Fetch all courses for the user
   */
  async fetchCourses(): Promise<void> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    store.setLoading(true);
    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/courses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch courses');
      const data = await response.json();
      store.setCourses(data);
    } catch (err) {
      console.error('Fetch courses error:', err);
    } finally {
      store.setLoading(false);
    }
  },

  /**
   * Fetch a single course by ID
   */
  async fetchCourseById(courseId: string): Promise<Course | null> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return null;

    store.setLoading(true);
    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/courses/${courseId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch course details');
      const data = await response.json();
      store.setActiveCourse(data);
      return data;
    } catch (err) {
      console.error('Fetch course details error:', err);
      return null;
    } finally {
      store.setLoading(false);
    }
  },

  /**
   * Upload syllabus PDF file
   */
  async uploadSyllabusPdf(uri: string, name: string): Promise<{ fileName: string; markdownDoc: string }> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) throw new Error('Authentication required.');

    const serverUrl = getApiBaseUrl();
    const uploadUrl = `${serverUrl}/api/courses/upload`;

    const formData = new FormData();
    const fileUri = Platform.OS === 'android' ? uri : uri.replace('file://', '');

    formData.append('pdf', {
      uri: fileUri,
      name: name || 'syllabus.pdf',
      type: 'application/pdf',
    } as any);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upload failed: ${errText}`);
    }

    return response.json();
  },

  /**
   * Call Groq to structure the syllabus text into a Course n-ary tree JSON
   */
  async parseSyllabusIntoStructure(syllabusText: string, level: string): Promise<any> {
    const authStore = useAuthStore.getState();
    const apiKey = authStore.user?.groqApiKey;
    if (!apiKey) {
      throw new Error('Groq API Key is missing. Please save it in settings.');
    }

    const systemPrompt = `You are an expert curriculum planner. Analyze the syllabus text and compile a structured JSON learning path.
Divide the content into 3 to 6 logical chapters (UNIT I, UNIT II, etc., as labeled in the syllabus).
Each chapter must contain 2 to 4 logical topics.
Each topic must contain 2 to 4 subtopics.
Generate unique, clear titles for every element.
Make sure you extract learningObjectives, courseOutcomes, prerequisites, and assign a recommended knowledgeLevel (Beginner, Intermediate, or Advanced).

Return ONLY a valid JSON object matching this structure (DO NOT wrap in markdown backticks \`\`\`json or add explanations):
{
  "name": "Computer Networks",
  "description": "Course description based on outcomes...",
  "learningObjectives": ["Learn Reference models", "Analyze protocols..."],
  "courseOutcomes": ["Describe OSI layers", "Differentiate TCP/IP..."],
  "prerequisites": ["Basic computer literacy", "Introduction to systems"],
  "knowledgeLevel": "${level}",
  "chapters": [
    {
      "id": "ch1",
      "title": "Chapter 1: Introduction",
      "topics": [
        {
          "id": "ch1_tp1",
          "title": "Topic 1: Network Types & Topologies",
          "subtopics": [
            { "id": "ch1_tp1_sub1", "title": "Network Topologies (Mesh, Ring, Star)" },
            { "id": "ch1_tp1_sub2", "title": "Local, Metropolitan & Wide Area Networks (LAN, MAN, WAN)" }
          ]
        }
      ]
    }
  ]
}`;

    const prompt = `Syllabus Markdown Content:\n${syllabusText}`;

    const sanitizedKey = apiKey.replace(/\s+/g, '');
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sanitizedKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // low temperature for precise JSON formatting
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Groq structuring failed: ${errBody}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || '';
    
    // Clean and parse JSON response
    try {
      const match = resultText.match(/\{[\s\S]*\}/);
      const jsonStr = match ? match[0] : resultText;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parsing of syllabus output failed:', resultText);
      throw new Error('Syllabus parser failed to return a valid JSON structure. Please retry.');
    }
  },

  /**
   * Save the generated course structure to MongoDB
   */
  async saveParsedCourse(courseData: any, syllabusMarkdown: string): Promise<Course> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) throw new Error('Authentication required.');

    const serverUrl = getApiBaseUrl();
    const response = await fetch(`${serverUrl}/api/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...courseData,
        syllabusMarkdown
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Saving course failed: ${errText}`);
    }

    return response.json();
  },

  /**
   * Delete a course
   */
  async deleteCourse(courseId: string): Promise<void> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    const serverUrl = getApiBaseUrl();
    const response = await fetch(`${serverUrl}/api/courses/${courseId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete course');
    store.removeCourse(courseId);
  },

  /**
   * Toggle completion status of a subtopic
   */
  async toggleSubtopicCompletion(
    courseId: string,
    chapterId: string,
    topicId: string,
    subtopicId: string,
    completed: boolean,
    score?: number,
    total?: number
  ): Promise<void> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    const serverUrl = getApiBaseUrl();
    const response = await fetch(`${serverUrl}/api/courses/${courseId}/subtopics/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ chapterId, topicId, subtopicId, completed, score, total })
    });

    if (!response.ok) throw new Error('Failed to update subtopic progress');
    const updatedCourse = await response.json();
    store.updateLocalCourseProgress(updatedCourse);
  },

  /**
   * Generate Socratic learning material (Explanations, Analogies, MCQs) from Groq
   */
  async getOrGenerateSocraticMaterial(
    course: Course,
    chapterId: string,
    chapterTitle: string,
    topicId: string,
    topicTitle: string,
    subtopicId: string,
    subtopicTitle: string
  ): Promise<any> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    const apiKey = authStore.user?.groqApiKey;

    if (!token) throw new Error('Authentication required.');
    const cacheKey = `${chapterId}:${topicId}:${subtopicId}`;

    // 1. Check if material is cached in Course document
    if (course.cachedContent && course.cachedContent[cacheKey]) {
      return course.cachedContent[cacheKey];
    }

    if (!apiKey) {
      throw new Error('Groq API Key is missing. Please save it in settings.');
    }

    store.setGenerating(true);
    try {
      const systemPrompt = `You are a Socratic Tutor for the course "${course.name}".
You must generate Socratic study slides and multiple-choice questions for the subtopic "${subtopicTitle}" under Chapter "${chapterTitle}", Topic "${topicTitle}".
Objectives: ${course.learningObjectives?.join(', ')}
Outcomes: ${course.courseOutcomes?.join(', ')}
Knowledge level: ${course.knowledgeLevel}

Generate a concise explanation, important key concepts, practical application examples, visual analogies, key takeaways, and exactly 2 multiple-choice Socratic questions.
For the Socratic questions:
- Do not make them simple. Test conceptual understanding.
- Write 4 options.
- The correctAnswer MUST exactly match one of the items in the options array.
- The socraticHint should never give the answer. Instead, ask a guiding question to lead them to discover the correction.

Return ONLY a valid JSON object matching this structure (no markdown wrapping, no explanation text outside the JSON):
{
  "explanation": "Concise text introducing this subtopic...",
  "concepts": ["Concept point 1", "Concept point 2"],
  "examples": ["Practical application example 1"],
  "analogies": ["Visual/metaphorical analogy..."],
  "takeaways": ["Takeaway 1", "Takeaway 2"],
  "questions": [
    {
      "question": "A conceptual multiple choice question?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "socraticHint": "Ponder on why Option B falls short..."
    },
    {
      "question": "Question 2?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "C",
      "socraticHint": "..."
    }
  ]
}`;

      const sanitizedKey = apiKey.replace(/\s+/g, '');
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanitizedKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Socratic generation failed: ${errText}`);
      }

      const resJson = await response.json();
      const contentText = resJson.choices?.[0]?.message?.content || '';
      
      const parsedContent = JSON.parse(contentText);

      // 2. Cache content in the backend database
      const serverUrl = getApiBaseUrl();
      const cacheResponse = await fetch(`${serverUrl}/api/courses/${course._id}/cache-content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subtopicKey: cacheKey,
          content: parsedContent
        })
      });

      if (cacheResponse.ok) {
        const cacheData = await cacheResponse.json();
        // Update local activeCourse cachedContent map
        const updatedCourse = { 
          ...course, 
          cachedContent: {
            ...course.cachedContent,
            [cacheKey]: parsedContent
          }
        };
        store.setActiveCourse(updatedCourse);
      }

      return parsedContent;
    } catch (err) {
      console.error('Socratic material generation failed:', err);
      throw err;
    } finally {
      store.setGenerating(false);
    }
  },

  /**
   * Fetch message history for the active course chat
   */
  async fetchCourseMessages(courseId: string): Promise<void> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/courses/${courseId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      store.setCourseMessages(data);
    } catch (err) {
      console.error('Fetch messages error:', err);
    }
  },

  /**
   * Saves a message in database
   */
  async saveMessage(
    courseId: string,
    role: 'user' | 'assistant',
    content: string,
    chapterId?: string,
    topicId?: string,
    subtopicId?: string
  ): Promise<CourseMessage | null> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return null;

    const serverUrl = getApiBaseUrl();
    const response = await fetch(`${serverUrl}/api/courses/${courseId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ role, content, chapterId, topicId, subtopicId })
    });

    if (!response.ok) throw new Error('Failed to save message');
    return response.json();
  },

  /**
   * Stream doubts resolution from Groq in Socratic style
   */
  async askDoubt(
    course: Course,
    question: string,
    chapterId?: string,
    chapterTitle?: string,
    topicId?: string,
    topicTitle?: string,
    subtopicId?: string,
    subtopicTitle?: string
  ): Promise<void> {
    const store = useCoursesStore.getState();
    const authStore = useAuthStore.getState();
    const apiKey = authStore.user?.groqApiKey;

    if (!apiKey) throw new Error('Groq API Key is missing. Please save it in settings.');

    // 1. Save user message to database
    let savedMsg: CourseMessage | null = null;
    try {
      savedMsg = await this.saveMessage(course._id, 'user', question, chapterId, topicId, subtopicId);
    } catch (e) {
      console.error('Failed to save user message to database, operating in-memory:', e);
    }

    const userMessage: CourseMessage = savedMsg || {
      _id: Math.random().toString(36).substring(7),
      userId: authStore.user?.id || '',
      courseId: course._id,
      role: 'user',
      content: question,
      chapterId,
      topicId,
      subtopicId,
      createdAt: new Date().toISOString()
    };

    store.addCourseMessage(userMessage);
    store.setChatThinking(true);
    store.setChatStreamingText('');

    // Compile list of completed subtopics to send as context
    const completedSubtopics: string[] = [];
    course.chapters.forEach(ch => {
      ch.topics.forEach(tp => {
        tp.subtopics.forEach(sub => {
          if (sub.completed) {
            completedSubtopics.push(sub.title);
          }
        });
      });
    });

    const systemPrompt = `You are a Socratic learning assistant for the course "${course.name}".
You have access to the student's syllabus structure and progress.
Current focus context:
${chapterTitle ? `- Chapter: ${chapterTitle}` : ''}
${topicTitle ? `- Topic: ${topicTitle}` : ''}
${subtopicTitle ? `- Subtopic: ${subtopicTitle}` : ''}
- Student Knowledge Level: ${course.knowledgeLevel}
- Completed concepts: ${completedSubtopics.length > 0 ? completedSubtopics.join(', ') : 'None yet'}

Your goal is to answer the student's questions and resolve doubts.
CRITICAL INSTRUCTION: Do not give the direct answer immediately. Instead, use the Socratic method: ask guided questions, point out logical gaps, give analogies, and lead the student to discover the answer themselves. Keep your responses short (under 3-4 paragraphs), helpful, and highly interactive.`;

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...store.courseMessages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const sanitizedKey = apiKey.replace(/\s+/g, '');
      const response = await expoFetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanitizedKey}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          stream: true,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errText}`);
      }

      if (!response.body) throw new Error('Response body is not readable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (store.chatThinking) store.setChatThinking(false);

        const chunkText = decoder.decode(value, { stream: true });
        buffer += chunkText;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;

          if (cleaned.startsWith('data: ')) {
            const dataStr = cleaned.slice(6);
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantText += delta;
                store.setChatStreamingText(assistantText);
              }
            } catch {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }

      store.setChatThinking(false);

      // Save complete reply to DB
      let assistantSavedMsg: CourseMessage | null = null;
      try {
        assistantSavedMsg = await this.saveMessage(course._id, 'assistant', assistantText, chapterId, topicId, subtopicId);
      } catch (e) {
        console.error('Failed to save assistant message to database:', e);
      }

      const assistantMessage: CourseMessage = assistantSavedMsg || {
        _id: Math.random().toString(36).substring(7),
        userId: authStore.user?.id || '',
        courseId: course._id,
        role: 'assistant',
        content: assistantText,
        chapterId,
        topicId,
        subtopicId,
        createdAt: new Date().toISOString()
      };

      store.addCourseMessage(assistantMessage);
      store.setChatStreamingText('');
    } catch (err) {
      console.error('Streaming doubt response error:', err);
      store.setChatThinking(false);
      store.setChatStreamingText('');
      throw err;
    }
  }
};

export default coursesService;
