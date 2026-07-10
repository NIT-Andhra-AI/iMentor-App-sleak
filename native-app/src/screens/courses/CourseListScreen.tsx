import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';
import { Course } from '../../types/courses.types';

export default function CourseListScreen() {
  const insets = useSafeAreaInsets();
  const { courses, loading, pushScreen, setActiveCourse } = useCoursesStore();

  useEffect(() => {
    coursesService.fetchCourses();
  }, []);

  const handleSelectCourse = (course: Course) => {
    setActiveCourse(course);
    pushScreen({ name: 'overview', courseId: course._id });
  };

  return (
    <View className="flex-1 bg-black px-5" style={{ paddingTop: insets.top + 20 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-white text-2xl font-bold tracking-tight">Personalized Courses</Text>
          <Text className="text-zinc-400 text-xs mt-0.5">Syllabus-driven Socratic learning</Text>
        </View>
        <TouchableOpacity
          onPress={() => pushScreen({ name: 'upload' })}
          className="w-10 h-10 rounded-full bg-blue-600 active:bg-blue-700 items-center justify-center border border-emerald-600/35"
        >
          <Feather name="plus" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Warning Notice Banner */}
      <View className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-4 mb-6 flex-row items-start">
        <Ionicons name="information-circle" size={20} color="#10B981" className="mr-3 mt-0.5" />
        <View className="flex-1">
          <Text className="text-emerald-400 font-bold text-xs tracking-wide uppercase">API Warning & Timetable</Text>
          <Text className="text-zinc-300 text-xs mt-1 leading-relaxed">
            This process may hit your Groq API limits. Start your learning, and later manage it with a daily timetable. Good luck!
          </Text>
        </View>
      </View>

      {/* Courses List Section */}
      <Text className="text-zinc-400 text-xs font-bold tracking-widest uppercase mb-3">Your Learning Paths</Text>

      {loading && courses.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : courses.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20 bg-zinc-950/20 border border-zinc-900 rounded-3xl px-6 mb-6">
          <Feather name="book-open" size={48} color="#1d4ed8" className="mb-4" />
          <Text className="text-white font-bold text-base text-center">No Courses Found</Text>
          <Text className="text-zinc-500 text-xs text-center mt-1.5 px-4 leading-normal">
            Upload your course syllabus PDF to automatically generate a Socratic curriculum.
          </Text>
          <TouchableOpacity
            onPress={() => pushScreen({ name: 'upload' })}
            className="mt-6 bg-blue-600 active:bg-blue-700 border border-emerald-700 px-6 py-3 rounded-2xl flex-row items-center"
          >
            <Feather name="upload-cloud" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">Upload Syllabus</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelectCourse(item)}
              activeOpacity={0.85}
              className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 mb-4 relative overflow-hidden"
            >
              {/* Decorative side accent gradient lines */}
              <View className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 to-emerald-600" />
              
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-white text-lg font-bold" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text className="text-zinc-400 text-xs mt-1 leading-normal" numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <View className="bg-emerald-950/40 border border-emerald-900 px-2 py-1 rounded-lg">
                  <Text className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    {item.knowledgeLevel}
                  </Text>
                </View>
              </View>

              {/* Progress Bar Section */}
              <View className="mt-5">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase">Overall Mastery</Text>
                  <Text className="text-blue-400 text-xs font-bold">{item.overallProgress}%</Text>
                </View>
                <View className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                  <View 
                    className="h-full bg-blue-600 rounded-full" 
                    style={{ 
                      width: `${item.overallProgress}%`,
                      backgroundColor: item.overallProgress > 70 ? '#059669' : '#2563eb' // Green if high progress, else blue
                    }} 
                  />
                </View>
              </View>

              {/* Stats Footer */}
              <View className="flex-row items-center justify-between mt-4 pt-3.5 border-t border-zinc-900/60">
                <View className="flex-row items-center">
                  <Feather name="folder" size={13} color="#71717a" />
                  <Text className="text-zinc-500 text-xs ml-1.5">
                    {item.chapters?.length || 0} Chapters
                  </Text>
                </View>
                <View className="flex-row items-center bg-blue-950/20 px-3 py-1 rounded-xl border border-blue-900/35">
                  <Text className="text-blue-400 text-[10px] font-bold">Start Learning</Text>
                  <Feather name="arrow-right" size={11} color="#3B82F6" className="ml-1" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
