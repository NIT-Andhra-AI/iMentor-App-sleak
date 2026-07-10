import React from 'react';
import { useCoursesStore } from '../../../store/courses.store';
import CourseListScreen from '../../../screens/courses/CourseListScreen';
import UploadCourseScreen from '../../../screens/courses/UploadCourseScreen';
import CourseOverviewScreen from '../../../screens/courses/CourseOverviewScreen';
import LearningSessionScreen from '../../../screens/courses/LearningSessionScreen';
import CourseChatScreen from '../../../screens/courses/CourseChatScreen';
import CourseSettingsScreen from '../../../screens/courses/CourseSettingsScreen';

const CoursesTab = () => {
  const navStack = useCoursesStore((state) => state.navStack);
  const currentScreen = navStack[navStack.length - 1] || { name: 'list' };

  switch (currentScreen.name) {
    case 'list':
      return <CourseListScreen />;
    case 'upload':
      return <UploadCourseScreen />;
    case 'overview':
      return <CourseOverviewScreen />;
    case 'session':
      return <LearningSessionScreen />;
    case 'chat':
      return <CourseChatScreen />;
    case 'settings':
      return <CourseSettingsScreen />;
    default:
      return <CourseListScreen />;
  }
};

export default CoursesTab;