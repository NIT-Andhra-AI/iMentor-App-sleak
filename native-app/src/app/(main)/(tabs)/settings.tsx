import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useChat } from '@/hooks/useChat';
import { Conversation } from '@/types/chat.types';
import { downloadModel, isModelDownloaded as verifyModelExists } from '@/services/modelDownload.service';
import { useRagStore } from '@/store/rag.store';
import { downloadVlmModel, isVlmModelDownloaded as verifyVlmDownloaded, deleteVlmModel } from '@/services/vlmDownload.service';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, saveGroqApiKey, logout, isModelDownloaded, setDownloaded } = useAuthStore();
  const { conversations, loadConversations, selectConversation, deleteConversation } = useChat();
  
  // Initialize with the user's saved key if it exists
  const [apiKey, setApiKey] = useState(user?.groqApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Offline Model Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // VLM Model State
  const { 
    vlmModelReady, 
    isVlmDownloading, 
    vlmDownloadProgress, 
    vlmSpeedMBps,
    setVlmModelReady 
  } = useRagStore();

  useEffect(() => {
    const checkVlm = async () => {
      const downloaded = await verifyVlmDownloaded();
      setVlmModelReady(downloaded);
    };
    checkVlm();
  }, []);

  const handleDownloadVlm = async () => {
    if (vlmModelReady) {
      Alert.alert(
        "Remove VLM Model", 
        "The RAG Image Captioner model is already downloaded. Do you want to remove it to free up space (~350MB)?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: async () => {
            await deleteVlmModel();
            Alert.alert("Removed", "The VLM model has been deleted from your device.");
          }}
        ]
      );
      return;
    }

    Alert.alert(
      "Download Image Captioner",
      "This will download the LiquidAI LFM 2.5 VL model (~350MB) to allow secure, on-device image description. Wi-Fi is recommended.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Download", 
          onPress: async () => {
            const success = await downloadVlmModel((progress, speed) => {});
            if (success) {
              Alert.alert("Success", "Offline Image Captioner model is ready!");
            } else {
              Alert.alert("Error", "Failed to download the VLM model. Please try again.");
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      await loadConversations();
      setIsLoadingHistory(false);
    };
    fetchHistory();
  }, []);

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

        {/* Offline RAG Image Captioner Section */}
        <View className="mb-8">
          <Text className="text-white text-lg font-bold mb-2">Offline RAG Image Captioner</Text>
          <Text className="text-zinc-400 text-sm leading-relaxed mb-4">
            To ensure absolute privacy and security, we run image descriptions entirely on your device. This Vision-Language Model (<Text className="text-emerald-500 font-semibold">LiquidAI LFM-2.5-VL 450M</Text>) describes any extracted images from your PDFs offline, without uploading them to external cloud APIs.
          </Text>

          <View className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Ionicons name="eye-outline" size={20} color="#10B981" />
                <Text className="text-white font-semibold ml-2">Local Image Captioner</Text>
              </View>
              {vlmModelReady && (
                <View className="bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <Text className="text-emerald-500 text-xs font-bold">Model Ready</Text>
                </View>
              )}
            </View>

            {isVlmDownloading ? (
              <View className="space-y-2">
                <View className="flex-row justify-between text-xs text-zinc-400 mb-1">
                  <Text className="text-zinc-400 text-xs">Downloading Model Files...</Text>
                  <Text className="text-blue-500 text-xs font-bold">{vlmSpeedMBps} MB/s</Text>
                </View>
                <View className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-1">
                  <View 
                    style={{ width: `${vlmDownloadProgress * 100}%` }} 
                    className="bg-blue-600 h-full rounded-full"
                  />
                </View>
                <Text className="text-zinc-500 text-[11px] text-right">
                  {Math.round(vlmDownloadProgress * 100)}% Complete
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleDownloadVlm}
                className={`py-3.5 px-4 rounded-xl items-center justify-center flex-row ${
                  vlmModelReady 
                    ? 'bg-zinc-800 border border-zinc-700' 
                    : 'bg-emerald-600'
                }`}
              >
                {vlmModelReady ? (
                  <>
                    <Feather name="trash-2" size={16} color="#EF4444" />
                    <Text className="text-red-500 font-bold ml-2">Delete Model (Free ~350MB)</Text>
                  </>
                ) : (
                  <>
                    <Feather name="download-cloud" size={16} color="#FFF" />
                    <Text className="text-white font-bold ml-2">Download VLM Model (350MB)</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Chat History Section */}
        <View className="mb-8 flex-1">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-lg font-bold">Chat History</Text>
            {isLoadingHistory && <ActivityIndicator color="#3B82F6" size="small" />}
          </View>
          
          <View className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex-1 min-h-[200px]">
            {conversations.length === 0 && !isLoadingHistory ? (
              <View className="p-6 items-center justify-center flex-1">
                <Ionicons name="chatbubbles-outline" size={32} color="#52525B" />
                <Text className="text-zinc-500 mt-2 text-center">No chat history found.</Text>
              </View>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(item) => item._id}
                scrollEnabled={false}
                renderItem={({ item }: { item: Conversation }) => (
                  <View className="flex-row items-center justify-between border-b border-zinc-800/50">
                    <TouchableOpacity 
                      className="flex-1 py-4 px-4 flex-row items-center"
                      onPress={() => {
                        selectConversation(item);
                        router.push('/(main)/(tabs)/chat');
                      }}
                    >
                      <Ionicons name="chatbox-outline" size={20} color="#71717A" />
                      <View className="ml-3 flex-1">
                        <Text className="text-white text-[15px] font-medium" numberOfLines={1}>{item.title}</Text>
                        <Text className="text-zinc-500 text-xs mt-1">{new Date(item.updatedAt).toLocaleDateString()}</Text>
                      </View>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      className="p-4"
                      onPress={() => {
                        Alert.alert("Delete Chat", "Are you sure you want to permanently delete this conversation?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteConversation(item._id) }
                        ]);
                      }}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity 
          onPress={handleLogout}
          className="bg-red-500/10 border border-red-500/20 py-4 rounded-2xl items-center flex-row justify-center mt-auto"
        >
          <Feather name="log-out" size={18} color="#EF4444" />
          <Text className="text-red-500 font-bold ml-2">Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}