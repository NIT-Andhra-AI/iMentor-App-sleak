import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  FlatList, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';
import { CourseMessage } from '../../types/courses.types';

export default function CourseChatScreen() {
  const insets = useSafeAreaInsets();
  const { 
    activeCourse, 
    activeSubtopic, 
    setActiveSubtopic,
    popScreen,
    courseMessages,
    chatThinking,
    chatStreamingText
  } = useCoursesStore();

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (activeCourse?._id) {
      coursesService.fetchCourseMessages(activeCourse._id);
    }
  }, [activeCourse]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (courseMessages.length > 0 || chatStreamingText) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [courseMessages.length, chatStreamingText]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !activeCourse) return;
    const userQuery = inputText.trim();
    setInputText('');

    try {
      // Find chapter & topic names if activeSubtopic is present
      let chapterTitle = undefined;
      let topicTitle = undefined;
      if (activeSubtopic) {
        const chapter = activeCourse.chapters.find(c => c.id === activeSubtopic.chapterId);
        const topic = chapter?.topics.find(t => t.id === activeSubtopic.topicId);
        chapterTitle = chapter?.title;
        topicTitle = topic?.title;
      }

      await coursesService.askDoubt(
        activeCourse,
        userQuery,
        activeSubtopic?.chapterId,
        chapterTitle,
        activeSubtopic?.topicId,
        topicTitle,
        activeSubtopic?.subtopicId,
        activeSubtopic?.title
      );
    } catch (err: any) {
      console.error('Ask doubt failed:', err);
    }
  };

  const handleClearContext = () => {
    setActiveSubtopic(null);
  };

  if (!activeCourse) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-zinc-900 bg-black">
          <View className="flex-1 flex-row items-center">
            <TouchableOpacity
              onPress={popScreen}
              className="flex-row items-center bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded-xl mr-3"
            >
              <Ionicons name="arrow-back" size={14} color="#A1A1AA" />
              <Text className="text-zinc-400 text-xs font-bold ml-1">Back</Text>
            </TouchableOpacity>

            <View className="flex-1 mr-2">
              <Text className="text-white text-sm font-bold" numberOfLines={1}>
                {activeCourse.name} Tutor
              </Text>
            </View>
          </View>
        </View>

        {/* Active Context Bar */}
        {activeSubtopic && (
          <View className="bg-emerald-950/20 border-b border-emerald-900/35 px-5 py-2 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-3">
              <Feather name="anchor" size={11} color="#10B981" />
              <Text className="text-emerald-400 text-[10.5px] font-bold ml-1.5 uppercase tracking-wider mr-1">Focus:</Text>
              <Text className="text-zinc-300 text-xs flex-1" numberOfLines={1}>
                {activeSubtopic.title}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={handleClearContext}
              className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md"
            >
              <Text className="text-zinc-500 text-[9px] font-bold uppercase">Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Message Thread */}
        <View className="flex-1">
          {courseMessages.length === 0 && !chatStreamingText && !chatThinking ? (
            <View className="flex-1 justify-center items-center px-6">
              <View className="w-12 h-12 bg-blue-900/10 border border-blue-800/20 rounded-full items-center justify-center mb-4">
                <Ionicons name="chatbubble-ellipses-outline" size={24} color="#2563eb" />
              </View>
              <Text className="text-zinc-400 text-sm font-bold mt-2 text-center">
                Ask anything about the curriculum.
              </Text>
              <Text className="text-zinc-600 text-xs mt-1.5 text-center leading-relaxed px-4">
                Your Socratic assistant is ready. Ask conceptual doubts, request further examples, or get clarifications on specific chapters.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={courseMessages}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ padding: 16 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isUser = item.role === 'user';
                return (
                  <View className={`mb-4 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <View className="w-7 h-7 bg-blue-900/10 border border-blue-800/20 rounded-full items-center justify-center mr-2.5 mt-1">
                        <Text className="text-blue-400 text-[10px] font-bold">iM</Text>
                      </View>
                    )}
                    <View className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      isUser 
                        ? 'bg-zinc-900 border border-zinc-800' 
                        : 'bg-zinc-950 border border-zinc-900'
                    }`}>
                      <Text className="text-zinc-100 text-[13.5px] leading-relaxed">
                        {item.content}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                <>
                  {chatStreamingText ? (
                    <View className="mb-4 flex-row justify-start">
                      <View className="w-7 h-7 bg-blue-900/10 border border-blue-800/20 rounded-full items-center justify-center mr-2.5 mt-1">
                        <Text className="text-blue-400 text-[10px] font-bold">iM</Text>
                      </View>
                      <View className="max-w-[80%] rounded-2xl px-4 py-3 bg-zinc-950 border border-zinc-900">
                        <Text className="text-zinc-100 text-[13.5px] leading-relaxed">
                          {chatStreamingText}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {chatThinking ? (
                    <View className="mb-4 flex-row justify-start items-center">
                      <View className="w-7 h-7 bg-blue-900/10 border border-blue-800/20 rounded-full items-center justify-center mr-2.5">
                        <Text className="text-blue-400 text-[10px] font-bold">iM</Text>
                      </View>
                      <ActivityIndicator size="small" color="#2563eb" />
                    </View>
                  ) : null}
                </>
              }
            />
          )}
        </View>

        {/* Input Bar */}
        <View className="px-4 py-3 border-t border-zinc-900 bg-zinc-950/60" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center bg-zinc-900/80 rounded-2xl border border-zinc-800 px-3 py-1.5">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask a doubt about this topic..."
              placeholderTextColor="#71717A"
              editable={!chatThinking && !chatStreamingText}
              className="flex-1 text-white text-xs h-10 px-2"
              onSubmitEditing={handleSendMessage}
            />

            <TouchableOpacity
              onPress={handleSendMessage}
              disabled={!inputText.trim() || chatThinking || !!chatStreamingText}
              className={`w-10 h-10 rounded-xl items-center justify-center ${
                inputText.trim() && !chatThinking && !chatStreamingText 
                  ? 'bg-blue-600' 
                  : 'bg-zinc-800 opacity-50'
              }`}
            >
              <Feather name="send" size={15} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}
