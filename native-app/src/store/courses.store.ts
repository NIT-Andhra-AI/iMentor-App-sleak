import { createStore } from './store';
import { Course, CourseMessage, CourseScreen } from '../types/courses.types';

interface CoursesState {
  courses: Course[];
  activeCourse: Course | null;
  activeSubtopic: { chapterId: string; topicId: string; subtopicId: string; title: string } | null;
  
  // Custom Stack Navigation state
  navStack: CourseScreen[];
  
  // API loading states
  loading: boolean;
  generating: boolean;
  uploading: boolean;
  uploadStep: 'idle' | 'uploading_pdf' | 'parsing_syllabus';
  
  // Chat state
  courseMessages: CourseMessage[];
  chatThinking: boolean;
  chatStreamingText: string;

  // Actions
  setCourses: (courses: Course[]) => void;
  addCourse: (course: Course) => void;
  removeCourse: (courseId: string) => void;
  setActiveCourse: (course: Course | null) => void;
  updateLocalCourseProgress: (course: Course) => void;
  setActiveSubtopic: (subtopic: { chapterId: string; topicId: string; subtopicId: string; title: string } | null) => void;
  
  // Navigation stack actions
  pushScreen: (screen: CourseScreen) => void;
  popScreen: () => void;
  resetNavigation: () => void;
  
  // Setter actions
  setLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setUploading: (uploading: boolean) => void;
  setUploadStep: (step: 'idle' | 'uploading_pdf' | 'parsing_syllabus') => void;
  
  // Chat actions
  setCourseMessages: (messages: CourseMessage[]) => void;
  addCourseMessage: (message: CourseMessage) => void;
  setChatThinking: (thinking: boolean) => void;
  setChatStreamingText: (text: string) => void;
  
  // Reset method
  resetCourseSession: () => void;
}

export const useCoursesStore = createStore<CoursesState>((set) => ({
  courses: [],
  activeCourse: null,
  activeSubtopic: null,
  navStack: [{ name: 'list' }],
  
  loading: false,
  generating: false,
  uploading: false,
  uploadStep: 'idle',
  
  courseMessages: [],
  chatThinking: false,
  chatStreamingText: '',

  setCourses: (courses) => set({ courses }),
  addCourse: (course) => set((state) => ({ courses: [course, ...state.courses] })),
  removeCourse: (courseId) => set((state) => ({ 
    courses: state.courses.filter(c => c._id !== courseId),
    activeCourse: state.activeCourse?._id === courseId ? null : state.activeCourse
  })),
  setActiveCourse: (activeCourse) => set({ activeCourse }),
  updateLocalCourseProgress: (updatedCourse) => set((state) => {
    const updatedCourses = state.courses.map(c => c._id === updatedCourse._id ? updatedCourse : c);
    return {
      courses: updatedCourses,
      activeCourse: state.activeCourse?._id === updatedCourse._id ? updatedCourse : state.activeCourse
    };
  }),
  setActiveSubtopic: (activeSubtopic) => set({ activeSubtopic }),

  pushScreen: (screen) => set((state) => ({ navStack: [...state.navStack, screen] })),
  popScreen: () => set((state) => {
    if (state.navStack.length <= 1) return {};
    const newStack = [...state.navStack];
    newStack.pop();
    return { navStack: newStack };
  }),
  resetNavigation: () => set({ navStack: [{ name: 'list' }] }),

  setLoading: (loading) => set({ loading }),
  setGenerating: (generating) => set({ generating }),
  setUploading: (uploading) => set({ uploading }),
  setUploadStep: (uploadStep) => set({ uploadStep }),

  setCourseMessages: (courseMessages) => set({ courseMessages }),
  addCourseMessage: (message) => set((state) => ({ courseMessages: [...state.courseMessages, message] })),
  setChatThinking: (chatThinking) => set({ chatThinking }),
  setChatStreamingText: (chatStreamingText) => set({ chatStreamingText }),

  resetCourseSession: () => set({
    activeCourse: null,
    activeSubtopic: null,
    navStack: [{ name: 'list' }],
    loading: false,
    generating: false,
    uploading: false,
    uploadStep: 'idle',
    courseMessages: [],
    chatThinking: false,
    chatStreamingText: ''
  })
}));

export default useCoursesStore;
