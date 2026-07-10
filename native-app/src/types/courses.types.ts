export interface Subtopic {
  id: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  latestQuizScore?: {
    score: number | null;
    total: number | null;
  };
}

export interface Topic {
  id: string;
  title: string;
  progress: number;
  subtopics: Subtopic[];
}

export interface Chapter {
  id: string;
  title: string;
  progress: number;
  topics: Topic[];
}

export interface Course {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  learningObjectives?: string[];
  courseOutcomes?: string[];
  prerequisites?: string[];
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  overallProgress: number;
  syllabusMarkdown?: string;
  chapters: Chapter[];
  cachedContent?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CourseMessage {
  _id: string;
  userId: string;
  courseId: string;
  role: 'user' | 'assistant';
  content: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
  createdAt: string;
}

export type CourseScreenName = 
  | 'list' 
  | 'upload' 
  | 'overview' 
  | 'session' 
  | 'chat' 
  | 'settings';

export interface CourseScreen {
  name: CourseScreenName;
  courseId?: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
}
