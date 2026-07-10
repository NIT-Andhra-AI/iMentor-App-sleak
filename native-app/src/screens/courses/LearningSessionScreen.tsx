import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';

type SlideIndex = 0 | 1 | 2 | 3; // Explanation, Concepts, Analogy/Examples, Quiz

export default function LearningSessionScreen() {
  const insets = useSafeAreaInsets();
  const { activeCourse, activeSubtopic, popScreen, pushScreen, generating } = useCoursesStore();

  const [currentSlide, setCurrentSlide] = useState<SlideIndex>(0);
  const [socraticContent, setSocraticContent] = useState<any>(null);
  
  // Quiz State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [wrongAnswersCount, setWrongAnswersCount] = useState(0);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);

  useEffect(() => {
    loadContent();
  }, [activeSubtopic]);

  const loadContent = async () => {
    if (!activeCourse || !activeSubtopic) return;
    
    // Find chapter and topic titles for context
    const chapter = activeCourse.chapters.find(c => c.id === activeSubtopic.chapterId);
    const topic = chapter?.topics.find(t => t.id === activeSubtopic.topicId);

    if (!chapter || !topic) return;

    try {
      const data = await coursesService.getOrGenerateSocraticMaterial(
        activeCourse,
        activeSubtopic.chapterId,
        chapter.title,
        activeSubtopic.topicId,
        topic.title,
        activeSubtopic.subtopicId,
        activeSubtopic.title
      );
      setSocraticContent(data);
    } catch (err: any) {
      Alert.alert('Generation Failed', err.message || 'Failed to load study material. Please try again.');
      popScreen();
    }
  };

  const handleOptionSelect = (option: string) => {
    if (quizCompleted || !socraticContent) return;
    setSelectedOption(option);
    
    const question = socraticContent.questions[currentQuestionIndex];
    if (option === question.correctAnswer) {
      setShowHint(false);
      setCorrectAnswersCount(prev => prev + 1);
      
      setTimeout(() => {
        if (currentQuestionIndex + 1 < socraticContent.questions.length) {
          // Go to next question
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedOption(null);
        } else {
          // End of quiz
          setQuizCompleted(true);
        }
      }, 1000);
    } else {
      setWrongAnswersCount(prev => prev + 1);
      setShowHint(true);
    }
  };

  const handleCompleteSubtopic = async () => {
    if (!activeCourse || !activeSubtopic || !socraticContent) return;

    try {
      const totalQuestions = socraticContent.questions.length;
      await coursesService.toggleSubtopicCompletion(
        activeCourse._id,
        activeSubtopic.chapterId,
        activeSubtopic.topicId,
        activeSubtopic.subtopicId,
        true,
        correctAnswersCount,
        totalQuestions
      );
      Alert.alert(
        'Congratulations!', 
        'You completed this subtopic! Keep up the great work.',
        [{ text: 'Return to Course', onPress: popScreen }]
      );
    } catch (err: any) {
      Alert.alert('Error', 'Failed to save completion status. Please check your internet.');
    }
  };

  const handleLaunchChat = () => {
    if (!activeCourse) return;
    pushScreen({
      name: 'chat',
      courseId: activeCourse._id,
      chapterId: activeSubtopic?.chapterId,
      topicId: activeSubtopic?.topicId,
      subtopicId: activeSubtopic?.subtopicId
    });
  };

  if (generating || !socraticContent) {
    return (
      <View className="flex-1 bg-black justify-center items-center px-6" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#2563eb" className="mb-4" />
        <Text className="text-white text-base font-bold text-center">Generating Socratic Material...</Text>
        <Text className="text-zinc-500 text-xs text-center mt-2.5 px-6 leading-relaxed">
          We are utilizing Groq to prepare explanations, visual analogies, and Socratic assessment questions for this subtopic.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-zinc-900 bg-black">
        <TouchableOpacity
          onPress={popScreen}
          className="flex-row items-center bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded-xl"
        >
          <Ionicons name="arrow-back" size={14} color="#A1A1AA" />
          <Text className="text-zinc-400 text-xs font-bold ml-1">Back</Text>
        </TouchableOpacity>

        <Text className="text-white text-xs font-bold max-w-[50%]" numberOfLines={1}>
          {activeSubtopic?.title}
        </Text>

        <TouchableOpacity
          onPress={handleLaunchChat}
          className="bg-blue-600/10 border border-blue-500/25 px-3 py-1.5 rounded-xl flex-row items-center"
        >
          <Ionicons name="chatbubbles-outline" size={14} color="#3B82F6" />
          <Text className="text-blue-400 text-xs font-bold ml-1.5">Ask AI</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView className="flex-1 px-5 py-4" showsVerticalScrollIndicator={false}>
        
        {/* Progress Tracker dots */}
        <View className="flex-row justify-center space-x-1.5 mb-5">
          {([0, 1, 2, 3] as SlideIndex[]).map((idx) => (
            <View
              key={idx}
              className={`h-1.5 rounded-full ${
                currentSlide === idx 
                  ? 'w-8 bg-blue-600' 
                  : 'w-4 bg-zinc-900'
              }`}
            />
          ))}
        </View>

        {/* Dynamic Card Deck View */}
        <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 min-h-[360px] shadow-lg relative overflow-hidden">
          
          {/* Card Slide 1: Basic Explanation */}
          {currentSlide === 0 && (
            <View className="flex-1">
              <View className="flex-row items-center mb-4">
                <View className="w-8 h-8 rounded-lg bg-blue-900/20 border border-blue-800/20 items-center justify-center mr-3">
                  <Feather name="book-open" size={16} color="#3B82F6" />
                </View>
                <Text className="text-white text-base font-bold">1. Subtopic Explanation</Text>
              </View>
              <Text className="text-zinc-300 text-sm leading-relaxed">
                {socraticContent.explanation}
              </Text>
            </View>
          )}

          {/* Card Slide 2: Core Concepts */}
          {currentSlide === 1 && (
            <View className="flex-1">
              <View className="flex-row items-center mb-4">
                <View className="w-8 h-8 rounded-lg bg-emerald-900/20 border border-emerald-800/20 items-center justify-center mr-3">
                  <Feather name="layers" size={16} color="#10B981" />
                </View>
                <Text className="text-white text-base font-bold">2. Critical Concepts</Text>
              </View>
              <View className="space-y-3.5 mt-2">
                {socraticContent.concepts?.map((c: string, idx: number) => (
                  <View key={idx} className="flex-row items-start">
                    <Text className="text-emerald-400 font-bold text-sm mr-2.5">0{idx + 1}.</Text>
                    <Text className="text-zinc-300 text-xs leading-normal flex-1">{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Card Slide 3: Analogy & Examples */}
          {currentSlide === 2 && (
            <View className="flex-1">
              <View className="flex-row items-center mb-4">
                <View className="w-8 h-8 rounded-lg bg-blue-900/20 border border-blue-800/20 items-center justify-center mr-3">
                  <Feather name="eye" size={16} color="#3B82F6" />
                </View>
                <Text className="text-white text-base font-bold">3. Analogy & Application</Text>
              </View>
              
              <View className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-2xl mb-4">
                <Text className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">Visual Analogy</Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  {socraticContent.analogies?.[0] || 'Analogies help you connect theoretical concepts with concrete visual templates.'}
                </Text>
              </View>

              <View className="bg-blue-950/20 border border-blue-900/35 p-4 rounded-2xl">
                <Text className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Real-world Example</Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  {socraticContent.examples?.[0] || 'Real world applications cement the concept in production setups.'}
                </Text>
              </View>
            </View>
          )}

          {/* Card Slide 4: Socratic Quiz */}
          {currentSlide === 3 && (
            <View className="flex-1">
              {quizCompleted ? (
                <View className="flex-1 items-center justify-center py-6">
                  <View className="w-16 h-16 bg-emerald-900/20 border border-emerald-800/40 rounded-full items-center justify-center mb-4">
                    <Feather name="award" size={32} color="#10B981" />
                  </View>
                  <Text className="text-white text-lg font-bold text-center">Socratic Quiz Completed!</Text>
                  <Text className="text-zinc-400 text-xs text-center mt-1.5 px-6 leading-normal">
                    You have parsed the conceptual checks. Ready to record subtopic completion.
                  </Text>
                  <Text className="text-blue-400 text-xs font-semibold mt-3 text-center">
                    Correct Answers: {correctAnswersCount}/{socraticContent.questions.length}
                  </Text>
                </View>
              ) : (
                <View className="flex-1">
                  <View className="flex-row items-center justify-between mb-3.5">
                    <Text className="text-zinc-400 text-xs font-bold uppercase">
                      Question {currentQuestionIndex + 1}/{socraticContent.questions.length}
                    </Text>
                    <View className="bg-blue-950/20 border border-blue-900/40 px-2 py-0.5 rounded-lg">
                      <Text className="text-blue-400 text-[10px] font-bold">Concept Check</Text>
                    </View>
                  </View>

                  <Text className="text-white text-[14px] font-semibold leading-relaxed mb-4">
                    {socraticContent.questions?.[currentQuestionIndex]?.question}
                  </Text>

                  {/* Options */}
                  <View className="space-y-2.5">
                    {socraticContent.questions?.[currentQuestionIndex]?.options?.map((option: string) => {
                      const isSelected = selectedOption === option;
                      const isCorrect = option === socraticContent.questions[currentQuestionIndex].correctAnswer;
                      let optionBg = 'bg-black/35 border-zinc-900';
                      let optionText = 'text-zinc-300';

                      if (isSelected) {
                        if (isCorrect) {
                          optionBg = 'bg-emerald-950/30 border-emerald-800';
                          optionText = 'text-emerald-400 font-bold';
                        } else {
                          optionBg = 'bg-red-950/30 border-red-900';
                          optionText = 'text-red-400 font-bold';
                        }
                      }

                      return (
                        <TouchableOpacity
                          key={option}
                          onPress={() => handleOptionSelect(option)}
                          className={`border rounded-2xl p-3.5 flex-row items-center ${optionBg}`}
                        >
                          <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${
                            isSelected && isCorrect 
                              ? 'border-emerald-500 bg-emerald-600' 
                              : isSelected && !isCorrect 
                              ? 'border-red-500 bg-red-600'
                              : 'border-zinc-800'
                          }`}>
                            {isSelected && (
                              <Feather name={isCorrect ? "check" : "x"} size={12} color="#FFF" />
                            )}
                          </View>
                          <Text className={`text-xs flex-1 ${optionText}`}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Socratic Hint */}
                  {showHint && selectedOption && (
                    <View className="mt-4 bg-emerald-950/20 border border-emerald-900/35 p-3 rounded-2xl flex-row items-start">
                      <Feather name="help-circle" size={16} color="#10B981" className="mr-2.5 mt-0.5" />
                      <View className="flex-1">
                        <Text className="text-emerald-400 text-[10.5px] font-bold uppercase tracking-wider">Socratic Guide Hint</Text>
                        <Text className="text-zinc-300 text-xs mt-0.5 leading-relaxed">
                          {socraticContent.questions[currentQuestionIndex].socraticHint}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

        </View>

        {/* Deck Navigation Buttons */}
        <View className="flex-row items-center justify-between mt-6 mb-16">
          <TouchableOpacity
            onPress={() => setCurrentSlide(prev => Math.max(0, prev - 1) as SlideIndex)}
            disabled={currentSlide === 0}
            className={`flex-row items-center px-4 py-3 rounded-2xl border ${
              currentSlide === 0 
                ? 'border-zinc-900 opacity-40' 
                : 'border-zinc-800 bg-zinc-950 active:bg-zinc-900'
            }`}
          >
            <Feather name="arrow-left" size={14} color={currentSlide === 0 ? '#52525b' : '#FFF'} />
            <Text className={`font-bold text-xs ml-2 ${currentSlide === 0 ? 'text-zinc-600' : 'text-white'}`}>
              Previous Card
            </Text>
          </TouchableOpacity>

          {currentSlide === 3 && quizCompleted ? (
            <TouchableOpacity
              onPress={handleCompleteSubtopic}
              className="flex-row items-center px-5 py-3 rounded-2xl bg-emerald-600 active:bg-emerald-700 border border-emerald-500/20"
            >
              <Feather name="check-circle" size={14} color="#FFF" />
              <Text className="text-white font-bold text-xs ml-2">
                Mark Completed
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setCurrentSlide(prev => Math.min(3, prev + 1) as SlideIndex)}
              disabled={currentSlide === 3}
              className={`flex-row items-center px-5 py-3 rounded-2xl border ${
                currentSlide === 3 
                  ? 'border-zinc-900 opacity-40' 
                  : 'border-blue-600 bg-blue-600 active:bg-blue-700'
              }`}
            >
              <Text className={`font-bold text-xs mr-2 ${currentSlide === 3 ? 'text-zinc-600' : 'text-white'}`}>
                {currentSlide === 2 ? 'Start Quiz' : 'Next Card'}
              </Text>
              <Feather name="arrow-right" size={14} color={currentSlide === 3 ? '#52525b' : '#FFF'} />
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
