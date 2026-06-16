import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useChat } from '@/hooks/useChat';
import { Conversation } from '@/types/chat.types';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, saveGroqApiKey, logout } = useAuthStore();
  const { conversations, loadConversations, selectConversation, deleteConversation } = useChat();
  
  // Initialize with the user's saved key if it exists
  const [apiKey, setApiKey] = useState(user?.groqApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      await loadConversations();
      setIsLoadingHistory(false);
    };
    fetchHistory();
  }, [loadConversations]);

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
        <Text className="text-white text-3xl font-extrabold tracking-tight mb-8">Settings</Text>

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