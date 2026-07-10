import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';
import { Course, Chapter, Topic, Subtopic } from '../../types/courses.types';

export default function CourseOverviewScreen() {
  const insets = useSafeAreaInsets();
  const { activeCourse, popScreen, pushScreen, setActiveSubtopic, setActiveCourse } = useCoursesStore();
  
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeCourse?._id) {
      refreshCourse();
    }
  }, []);

  const refreshCourse = async () => {
    if (!activeCourse?._id) return;
    setLoading(true);
    await coursesService.fetchCourseById(activeCourse._id);
    setLoading(false);
  };

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  const handleStartSubtopic = (chapter: Chapter, topic: Topic, subtopic: Subtopic) => {
    setActiveSubtopic({
      chapterId: chapter.id,
      topicId: topic.id,
      subtopicId: subtopic.id,
      title: subtopic.title
    });
    pushScreen({
      name: 'session',
      courseId: activeCourse?._id,
      chapterId: chapter.id,
      topicId: topic.id,
      subtopicId: subtopic.id
    });
  };

  const handleToggleCompletedInline = async (chapterId: string, topicId: string, subtopicId: string, currentCompleted: boolean) => {
    if (!activeCourse?._id) return;
    try {
      await coursesService.toggleSubtopicCompletion(
        activeCourse._id,
        chapterId,
        topicId,
        subtopicId,
        !currentCompleted
      );
    } catch (err) {
      console.error('Toggle completion in overview failed:', err);
    }
  };

  if (!activeCourse) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const completedSubtopicsCount = activeCourse.chapters.reduce(
    (acc, ch) => acc + ch.topics.reduce(
      (tAcc, tp) => tAcc + tp.subtopics.filter(sub => sub.completed).length, 0
    ), 0
  );

  const totalSubtopicsCount = activeCourse.chapters.reduce(
    (acc, ch) => acc + ch.topics.reduce(
      (tAcc, tp) => tAcc + tp.subtopics.length, 0
    ), 0
  );

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Sticky Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-zinc-900 bg-black">
        <TouchableOpacity
          onPress={popScreen}
          className="flex-row items-center bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded-xl"
        >
          <Ionicons name="arrow-back" size={14} color="#A1A1AA" />
          <Text className="text-zinc-400 text-xs font-bold ml-1">Back</Text>
        </TouchableOpacity>

        <Text className="text-white text-sm font-bold max-w-[50%]" numberOfLines={1}>
          {activeCourse.name}
        </Text>

        <View className="flex-row items-center space-x-2">
          <TouchableOpacity
            onPress={refreshCourse}
            className="w-8 h-8 rounded-xl bg-zinc-950 border border-zinc-900 items-center justify-center mr-2"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Feather name="refresh-cw" size={13} color="#A1A1AA" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => pushScreen({ name: 'settings', courseId: activeCourse._id })}
            className="w-8 h-8 rounded-xl bg-zinc-950 border border-zinc-900 items-center justify-center"
          >
            <Feather name="settings" size={13} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* Course Card Summary */}
        <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 mt-4 mb-4 relative overflow-hidden">
          <View className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
          <Text className="text-white text-xl font-bold">{activeCourse.name}</Text>
          {activeCourse.description ? (
            <Text className="text-zinc-400 text-xs mt-1.5 leading-relaxed">
              {activeCourse.description}
            </Text>
          ) : null}
          
          <View className="flex-row items-center mt-4 space-x-3">
            <View className="bg-blue-950/20 border border-blue-900/40 px-2.5 py-1 rounded-lg">
              <Text className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                {activeCourse.knowledgeLevel}
              </Text>
            </View>
            <View className="bg-emerald-950/20 border border-emerald-900/40 px-2.5 py-1 rounded-lg">
              <Text className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {completedSubtopicsCount}/{totalSubtopicsCount} Completed
              </Text>
            </View>
          </View>

          {/* Progress Display */}
          <View className="mt-5 pt-4 border-t border-zinc-900/60">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Syllabus Progress</Text>
              <Text className="text-emerald-400 text-xs font-bold">{activeCourse.overallProgress}%</Text>
            </View>
            <View className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
              <View 
                className="h-full bg-emerald-600 rounded-full" 
                style={{ width: `${activeCourse.overallProgress}%` }} 
              />
            </View>
          </View>
        </View>

        {/* Warning Banner */}
        <View className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-4 mb-5 flex-row items-start">
          <Ionicons name="information-circle" size={20} color="#10B981" className="mr-3 mt-0.5" />
          <View className="flex-1">
            <Text className="text-emerald-400 font-bold text-xs tracking-wide uppercase">API Warning & Timetable</Text>
            <Text className="text-zinc-300 text-xs mt-1 leading-relaxed">
              This process may hit your Groq API limits. Start your learning, and later manage it with a daily timetable. Good luck!
            </Text>
          </View>
        </View>

        {/* Syllabus Hierarchy Accordions */}
        <Text className="text-zinc-400 text-xs font-bold tracking-widest uppercase mb-3">Course Curriculum</Text>

        {activeCourse.chapters?.map((chapter) => {
          const isExpanded = !!expandedChapters[chapter.id];
          return (
            <View key={chapter.id} className="bg-zinc-950 border border-zinc-900 rounded-2xl mb-3 overflow-hidden">
              {/* Accordion Chapter Header */}
              <TouchableOpacity
                onPress={() => toggleChapter(chapter.id)}
                activeOpacity={0.8}
                className="flex-row items-center justify-between p-4 bg-zinc-900/30"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-white text-[14.5px] font-bold" numberOfLines={1}>
                    {chapter.title}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Text className="text-zinc-500 text-[10px] font-semibold uppercase">Chapter Progress: </Text>
                    <Text className="text-blue-400 text-[10px] font-bold">{chapter.progress}%</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  {/* Small progress dot */}
                  <View className="w-5 h-5 rounded-full items-center justify-center mr-3 bg-emerald-950/40 border border-emerald-900/30">
                    <Text className="text-emerald-400 text-[8px] font-bold">
                      {chapter.topics.reduce((acc, t) => acc + t.subtopics.filter(s => s.completed).length, 0)}
                    </Text>
                  </View>
                  <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#71717A" />
                </View>
              </TouchableOpacity>

              {/* Accordion Topics List */}
              {isExpanded && (
                <View className="border-t border-zinc-900/40 px-3 pb-3">
                  {chapter.topics.length === 0 ? (
                    <Text className="text-zinc-600 text-xs text-center py-4">No topics in this chapter.</Text>
                  ) : (
                    chapter.topics.map((topic) => (
                      <View key={topic.id} className="mt-3 bg-black/40 border border-zinc-900 rounded-xl p-3">
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="text-zinc-200 text-xs font-bold flex-1 mr-2" numberOfLines={1}>
                            {topic.title}
                          </Text>
                          <Text className="text-blue-400 text-[10px] font-bold">{topic.progress}%</Text>
                        </View>

                        {/* Subtopics checklist */}
                        <View className="space-y-2.5">
                          {topic.subtopics.map((subtopic) => (
                            <View key={subtopic.id} className="flex-row items-center justify-between py-1 border-b border-zinc-900/30 pb-2">
                              <View className="flex-row items-center flex-1 mr-3">
                                {/* Complete Checkbox */}
                                <TouchableOpacity
                                  onPress={() => handleToggleCompletedInline(chapter.id, topic.id, subtopic.id, subtopic.completed)}
                                  className={`w-[18px] h-[18px] rounded-md border items-center justify-center mr-2.5 ${
                                    subtopic.completed 
                                      ? 'bg-emerald-600 border-emerald-500' 
                                      : 'border-zinc-800 bg-zinc-900/30'
                                  }`}
                                >
                                  {subtopic.completed && <Feather name="check" size={12} color="#FFF" />}
                                </TouchableOpacity>

                                <View className="flex-1">
                                  <Text className={`text-[12.5px] leading-snug ${subtopic.completed ? 'text-zinc-500 line-through' : 'text-zinc-300'}`} numberOfLines={2}>
                                    {subtopic.title}
                                  </Text>
                                  {subtopic.latestQuizScore && subtopic.latestQuizScore.score !== null ? (
                                    <Text className="text-[10px] text-blue-400 font-bold mt-0.5">
                                      Quiz: {subtopic.latestQuizScore.score}/{subtopic.latestQuizScore.total}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>

                              {/* Start Session Trigger */}
                              <TouchableOpacity
                                onPress={() => handleStartSubtopic(chapter, topic, subtopic)}
                                className="bg-blue-600/10 border border-blue-500/25 px-2.5 py-1 rounded-lg flex-row items-center"
                              >
                                <Text className="text-blue-400 text-[10px] font-bold">Study</Text>
                                <Feather name="chevron-right" size={10} color="#60A5FA" className="ml-0.5" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })}
        <View className="h-16" />
      </ScrollView>

      {/* Floating Doubt-Chat trigger */}
      <TouchableOpacity
        onPress={() => pushScreen({ name: 'chat', courseId: activeCourse._id })}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 items-center justify-center shadow-lg border border-emerald-600/40"
      >
        <Ionicons name="chatbubbles" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}
