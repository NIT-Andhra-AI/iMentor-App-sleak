import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { downloadModel } from '@/services/modelDownload.service';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, saveGroqApiKey, logout, isModelDownloaded, setDownloaded } = useAuthStore();
  
  // Initialize with the user's saved key if it exists
  const [apiKey, setApiKey] = useState(user?.groqApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Offline Model Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  // Interactive Guide tab selection
  const [activeGuideTab, setActiveGuideTab] = useState<'chat' | 'course' | 'rag'>('chat');

  const handleDownloadModel = async () => {
    if (isModelDownloaded) {
      Alert.alert("Already Downloaded", "The Llama 3.2 offline model is already downloaded and ready to use!");
      return;
    }

    Alert.alert(
      "Download Offline Model",
      "This will download the Llama 3.2 1B SpinQuant model (~1.3 GB). It is highly recommended to connect to Wi-Fi before proceeding.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Download", 
          onPress: async () => {
            setIsDownloading(true);
            setDownloadProgress(0);
            const success = await downloadModel((progress) => {
              setDownloadProgress(progress);
            });
            setIsDownloading(false);
            
            if (success) {
              setDownloaded(true);
              Alert.alert("Success", "Offline model downloaded successfully!");
            } else {
              Alert.alert("Error", "Failed to download the offline model. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert("Invalid Key", "Please enter a valid Groq API Key.");
      return;
    }

    setIsSaving(true);
    try {
      await saveGroqApiKey(apiKey.trim());
      Alert.alert("Success", "Your Groq API Key has been securely encrypted and saved to your account!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save API key.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out? Your local offline chat history will remain on this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: async () => {
          await logout();
          router.replace('/(auth)/landing');
        }}
      ]
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView className="flex-1 px-5" style={{ paddingTop: insets.top + 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-white text-3xl font-extrabold tracking-tight">Settings</Text>
          
          <TouchableOpacity 
            onPress={handleDownloadModel}
            disabled={isDownloading || isModelDownloaded}
            className={`px-4 py-2 rounded-full border ${
              isModelDownloaded 
                ? 'bg-emerald-500/10 border-emerald-500/20' 
                : isDownloading 
                  ? 'bg-blue-500/10 border-blue-500/20'
                  : 'bg-zinc-800 border-zinc-700'
            }`}
          >
            {isModelDownloaded ? (
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="text-emerald-500 font-bold ml-1 text-xs">Model Ready</Text>
              </View>
            ) : isDownloading ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#3B82F6" style={{ transform: [{ scale: 0.7 }] }} />
                <Text className="text-blue-500 font-bold ml-1 text-xs">
                  {Math.round(downloadProgress * 100)}%
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center">
                <Feather name="download-cloud" size={16} color="#E4E4E7" />
                <Text className="text-zinc-200 font-bold ml-1 text-xs">Download Model</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Profile Section */}
        <View className="bg-zinc-900 rounded-3xl p-5 mb-8 border border-zinc-800">
          <View className="flex-row items-center mb-4">
            <View className="w-16 h-16 bg-blue-600 rounded-full items-center justify-center mr-4">
              <Text className="text-white text-2xl font-bold uppercase">{user?.name?.charAt(0) || 'U'}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white text-xl font-bold">{user?.name || 'User'}</Text>
              <Text className="text-zinc-400 text-sm">{user?.email || 'user@example.com'}</Text>
            </View>
          </View>
        </View>

        {/* Groq API Key Section */}
        <View className="mb-8">
          <Text className="text-white text-lg font-bold mb-2">Groq API Key</Text>
          <Text className="text-zinc-400 text-sm leading-relaxed mb-4">
            Provide your Groq API Key to chat online with ultra-fast inference. Your key is symmetrically encrypted using AES-256 before being stored in the database.
          </Text>

          <View className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden mb-4">
            <View className="flex-row items-center px-4 py-3 border-b border-zinc-800">
              <Feather name="key" size={18} color="#71717A" />
              <TextInput
                className="flex-1 text-white text-[15px] ml-3 h-10"
                placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor="#52525B"
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry={true}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            
            <TouchableOpacity 
              onPress={handleSaveKey}
              disabled={isSaving || !apiKey.trim() || apiKey === user?.groqApiKey}
              className={`py-4 items-center justify-center ${isSaving || !apiKey.trim() || apiKey === user?.groqApiKey ? 'bg-zinc-800' : 'bg-blue-600'}`}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className={`font-bold text-[15px] tracking-wide ${isSaving || !apiKey.trim() || apiKey === user?.groqApiKey ? 'text-zinc-500' : 'text-white'}`}>
                  {apiKey === user?.groqApiKey ? 'Key Secured' : 'Save Encrypted Key'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Feature Guides & Warnings Accordion */}
        <View className="mb-8 bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
          <Text className="text-white text-lg font-bold mb-1.5">Guides & Warnings</Text>
          <Text className="text-zinc-400 text-xs mb-4">
            Select a feature tab below to view its basic workflow instructions and critical warnings.
          </Text>

          {/* Pill Selector */}
          <View className="flex-row bg-black p-1 rounded-xl mb-5 border border-zinc-900">
            {(['chat', 'course', 'rag'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveGuideTab(tab)}
                className={`flex-1 py-2.5 items-center rounded-lg ${
                  activeGuideTab === tab 
                    ? 'bg-blue-600 border border-blue-500/10' 
                    : 'bg-transparent'
                }`}
              >
                <Text className={`font-bold text-xs uppercase tracking-wider ${
                  activeGuideTab === tab ? 'text-white' : 'text-zinc-500'
                }`}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Active Content */}
          {activeGuideTab === 'chat' && (
            <View>
              <Text className="text-blue-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                Chat Workflow
              </Text>
              <View className="space-y-2 mb-4">
                <Text className="text-zinc-300 text-xs leading-normal">
                  1. Open the **Chat** tab to initiate generic learning dialogues.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  2. Use the top toggle to switch between **Online** (Groq) and **Offline** (Local Llama) models.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  3. Input queries or press microphone to dictate doubts.
                </Text>
              </View>

              <Text className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                Chat Warnings & Limits
              </Text>
              <View className="space-y-2">
                <Text className="text-zinc-400 text-[11px] leading-relaxed">
                  • Offline chat requires downloading the 1.3 GB local Llama model file first.
                </Text>
                <Text className="text-zinc-400 text-[11px] leading-relaxed">
                  • Running local generation on-device will increase CPU load and battery consumption.
                </Text>
              </View>
            </View>
          )}

          {activeGuideTab === 'course' && (
            <View>
              <Text className="text-blue-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                Socratic Course Workflow
              </Text>
              <View className="space-y-2 mb-4">
                <Text className="text-zinc-300 text-xs leading-normal">
                  1. Go to the **Courses** tab and upload your syllabus PDF.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  2. Choose your difficulty level and click "Ingest" to compile the chapter tree.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  3. Select a subtopic to review Socratic Cards (Explanation ➔ Analogy ➔ MCQ Quiz).
                </Text>
              </View>

              <Text className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                Course Warnings & Limits
              </Text>
              <View className="space-y-2">
                <Text className="text-zinc-400 text-[11px] leading-relaxed">
                  • Ingestion and Socratic generations are online-dependent.
                </Text>
                <Text className="text-zinc-400 text-[11px] leading-relaxed font-semibold">
                  • This process may hit your Groq API limits. Start your learning, and later manage it with a daily timetable. Good luck!
                </Text>
              </View>
            </View>
          )}

          {activeGuideTab === 'rag' && (
            <View>
              <Text className="text-blue-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                RAG Document Workflow
              </Text>
              <View className="space-y-2 mb-4">
                <Text className="text-zinc-300 text-xs leading-normal">
                  1. Go to the **Documents** tab and upload reference textbook PDFs.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  2. Wait for the server to extract text and index document chunks.
                </Text>
                <Text className="text-zinc-300 text-xs leading-normal">
                  3. Select the document to query it directly, extracting target answers grounded in the text.
                </Text>
              </View>

              <Text className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                RAG Warnings & Limits
              </Text>
              <View className="space-y-2">
                <Text className="text-zinc-400 text-[11px] leading-relaxed">
                  • Ingesting massive PDFs (e.g., &gt;100 pages) may cause temporary extraction latency.
                </Text>
                <Text className="text-zinc-400 text-[11px] leading-relaxed">
                  • Non-textual components (e.g. photos, charts) are not indexed; only textual contents are queried.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity 
          onPress={handleLogout}
          className="bg-red-500/10 border border-red-500/20 py-4 rounded-2xl items-center flex-row justify-center mt-6"
        >
          <Feather name="log-out" size={18} color="#EF4444" />
          <Text className="text-red-500 font-bold ml-2">Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}