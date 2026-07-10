import React from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';

export default function CourseSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { activeCourse, popScreen, resetNavigation, loading, setLoading } = useCoursesStore();

  const handleDeleteCourse = () => {
    if (!activeCourse) return;

    Alert.alert(
      'Delete Course',
      `Are you sure you want to permanently delete "${activeCourse.name}" and all of its progress and chat messages? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await coursesService.deleteCourse(activeCourse._id);
              Alert.alert('Deleted', 'The course has been successfully deleted.');
              resetNavigation(); // Return to courses list
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete course.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (!activeCourse) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Calculate statistics
  const totalChapters = activeCourse.chapters?.length || 0;
  const totalTopics = activeCourse.chapters?.reduce((acc, ch) => acc + (ch.topics?.length || 0), 0) || 0;
  const totalSubtopics = activeCourse.chapters?.reduce(
    (acc, ch) => acc + (ch.topics?.reduce((tAcc, tp) => tAcc + (tp.subtopics?.length || 0), 0) || 0), 0
  ) || 0;

  const completedSubtopics = activeCourse.chapters?.reduce(
    (acc, ch) => acc + (ch.topics?.reduce((tAcc, tp) => tAcc + (tp.subtopics?.filter(s => s.completed).length || 0), 0) || 0), 0
  ) || 0;

  return (
    <View className="flex-1 bg-black px-5" style={{ paddingTop: insets.top + 20 }}>
      {/* Header */}
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={popScreen}
          className="flex-row items-center bg-zinc-950 border border-zinc-900 px-3.5 py-2 rounded-2xl mr-4"
        >
          <Ionicons name="arrow-back" size={16} color="#A1A1AA" />
          <Text className="text-zinc-400 text-xs font-bold ml-1.5">Back</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold tracking-tight">Course Settings</Text>
      </View>

      {/* Information Cards */}
      <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 mb-5">
        <Text className="text-white text-base font-bold mb-1.5">{activeCourse.name}</Text>
        <Text className="text-zinc-400 text-xs leading-normal">
          {activeCourse.description || 'No description provided.'}
        </Text>
        
        <View className="flex-row items-center mt-4 pt-4 border-t border-zinc-900/60 justify-between">
          <Text className="text-zinc-500 text-xs font-semibold">Recommended Level:</Text>
          <View className="bg-emerald-950/20 border border-emerald-900/40 px-2 py-0.5 rounded-md">
            <Text className="text-emerald-400 text-[10px] font-bold uppercase">{activeCourse.knowledgeLevel}</Text>
          </View>
        </View>
      </View>

      {/* Course Stats */}
      <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3">Course Statistics</Text>
      <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 mb-8 space-y-3.5">
        <View className="flex-row justify-between">
          <Text className="text-zinc-500 text-xs">Total Chapters</Text>
          <Text className="text-white text-xs font-bold">{totalChapters}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-zinc-500 text-xs">Total Topics</Text>
          <Text className="text-white text-xs font-bold">{totalTopics}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-zinc-500 text-xs">Total Subtopics</Text>
          <Text className="text-white text-xs font-bold">{totalSubtopics}</Text>
        </View>
        <View className="flex-row justify-between pt-3 border-t border-zinc-900/40">
          <Text className="text-zinc-500 text-xs">Completed Concepts</Text>
          <Text className="text-emerald-400 text-xs font-bold">{completedSubtopics} / {totalSubtopics}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-zinc-500 text-xs">Overall Progress</Text>
          <Text className="text-blue-400 text-xs font-bold">{activeCourse.overallProgress}%</Text>
        </View>
      </View>

      {/* Danger Zone */}
      <Text className="text-red-500/80 text-xs font-bold uppercase tracking-wider mb-3">Danger Zone</Text>
      <View className="bg-red-950/10 border border-red-900/25 rounded-3xl p-5">
        <Text className="text-white text-xs font-bold mb-1">Delete Learning Path</Text>
        <Text className="text-zinc-500 text-[10.5px] leading-relaxed mb-4">
          Once you delete this course, the syllabus structure, progress history, cached Socratic explanations, and chat interactions will be permanently erased.
        </Text>
        
        <TouchableOpacity
          onPress={handleDeleteCourse}
          disabled={loading}
          className="bg-red-900/20 active:bg-red-900/35 border border-red-800/40 py-3.5 rounded-2xl items-center justify-center flex-row"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <>
              <Feather name="trash-2" size={14} color="#EF4444" className="mr-2" />
              <Text className="text-red-500 font-bold text-xs">Delete Course</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
