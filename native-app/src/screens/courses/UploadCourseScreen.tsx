import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import useCoursesStore from '../../store/courses.store';
import coursesService from '../../services/courses.service';

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export default function UploadCourseScreen() {
  const insets = useSafeAreaInsets();
  const { popScreen, addCourse, pushScreen, setActiveCourse } = useCoursesStore();

  const [difficulty, setDifficulty] = useState<Difficulty>('Beginner');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<'idle' | 'reading_pdf' | 'compiling_markdown' | 'structuring_tree' | 'saving'>('idle');

  const handlePickSyllabus = async () => {
    // 1. Pick PDF Document
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
    } catch (err) {
      console.error('File pick error:', err);
      Alert.alert('File Picker Error', 'Could not open the file browser.');
      return;
    }

    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset.uri) return;

    setUploading(true);
    setUploadStep('reading_pdf');

    try {
      // 2. Upload to backend for PDF raw parsing
      const { fileName, markdownDoc } = await coursesService.uploadSyllabusPdf(
        asset.uri,
        asset.name || 'syllabus.pdf'
      );

      // 3. Send text to Groq for structurizing hierarchy JSON
      setUploadStep('structuring_tree');
      const courseStructure = await coursesService.parseSyllabusIntoStructure(markdownDoc, difficulty);

      // 4. Save to MongoDB
      setUploadStep('saving');
      const savedCourse = await coursesService.saveParsedCourse(courseStructure, markdownDoc);

      // 5. Success! Add to list, select it, and push to overview
      addCourse(savedCourse);
      setActiveCourse(savedCourse);
      
      // Update store history
      await coursesService.fetchCourses();

      setUploading(false);
      setUploadStep('idle');

      Alert.alert(
        'Success', 
        `"${savedCourse.name}" has been parsed and generated successfully!`,
        [
          { 
            text: 'Let\'s Learn', 
            onPress: () => {
              // Replace upload screen with overview screen by popping and pushing
              popScreen(); 
              pushScreen({ name: 'overview', courseId: savedCourse._id });
            } 
          }
        ]
      );
    } catch (err: any) {
      console.error('Syllabus pipeline error:', err);
      setUploading(false);
      setUploadStep('idle');
      Alert.alert('Processing Failed', err.message || 'An error occurred while compiling the course.');
    }
  };

  if (uploading) {
    return (
      <View className="flex-1 bg-black justify-center items-center px-6" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#2563eb" className="mb-6" />
        <Text className="text-white text-xl font-bold text-center">
          {uploadStep === 'reading_pdf' && 'Uploading Syllabus PDF...'}
          {uploadStep === 'compiling_markdown' && 'Deduplicating syllabus content...'}
          {uploadStep === 'structuring_tree' && 'Groq AI structuring chapters...'}
          {uploadStep === 'saving' && 'Building course learning tree...'}
        </Text>
        <Text className="text-zinc-500 text-xs text-center mt-3 px-6 leading-relaxed">
          {uploadStep === 'structuring_tree' 
            ? 'We are calling Llama 70B via Groq to extract objectives, units, and structure. This may take 5-10 seconds.'
            : 'Please keep the app open while we structure your personalized curriculum.'}
        </Text>
      </View>
    );
  }

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
        <Text className="text-white text-xl font-bold tracking-tight">Ingest Syllabus</Text>
      </View>

      {/* Select Target Difficulty */}
      <View className="mb-8">
        <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3">
          1. Choose Learning Level
        </Text>
        <View className="flex-row bg-zinc-950 p-1.5 rounded-2xl border border-zinc-900">
          {(['Beginner', 'Intermediate', 'Advanced'] as Difficulty[]).map((level) => (
            <TouchableOpacity
              key={level}
              onPress={() => setDifficulty(level)}
              className={`flex-1 py-3 items-center rounded-xl ${
                difficulty === level 
                  ? 'bg-blue-600 border border-blue-500/20' 
                  : 'bg-transparent'
              }`}
            >
              <Text className={`font-bold text-xs ${difficulty === level ? 'text-white' : 'text-zinc-500'}`}>
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-zinc-500 text-[10.5px] leading-relaxed mt-2.5 px-1">
          {difficulty === 'Beginner' && 'Introduces fundamentals in simple terms with basic questions. Ideal for initial exposure.'}
          {difficulty === 'Intermediate' && 'Focuses on application, protocols, systems analysis, and standard conceptual problems.'}
          {difficulty === 'Advanced' && 'Demands deep technical arguments, tradeoffs, mathematical reasoning, and challenging Socratic MCQs.'}
        </Text>
      </View>

      {/* Upload Zone */}
      <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3">
        2. Ingest Document
      </Text>
      <TouchableOpacity
        onPress={handlePickSyllabus}
        className="border-2 border-dashed border-zinc-800 bg-zinc-950/40 rounded-3xl p-8 items-center justify-center min-h-[220px] active:border-emerald-600/50"
      >
        <View className="w-14 h-14 bg-blue-900/10 border border-blue-800/20 rounded-2xl items-center justify-center mb-4">
          <Feather name="upload-cloud" size={28} color="#2563eb" />
        </View>
        <Text className="text-white text-base font-bold text-center">Select Syllabus PDF</Text>
        <Text className="text-zinc-500 text-xs text-center mt-2 px-6 leading-relaxed">
          Pick your university curriculum or course syllabus document. We will analyze topics, chapters, and competencies to generate your tree.
        </Text>
      </TouchableOpacity>

      {/* API Notice */}
      <View className="mt-auto mb-8 bg-zinc-950/20 border border-zinc-900 rounded-2xl p-4 flex-row items-center">
        <Feather name="shield" size={16} color="#059669" className="mr-3" />
        <Text className="text-zinc-500 text-[11px] leading-relaxed flex-1">
          Syllabus reading uses a secure, offline parser on our server. The structured tree hierarchy is compiled on Groq and saved locally on your account.
        </Text>
      </View>
    </View>
  );
}
