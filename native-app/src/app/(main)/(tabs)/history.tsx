import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  FlatList, 
  Alert, 
  RefreshControl 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChat } from '@/hooks/useChat';
import { useRagStore } from '@/store/rag.store';
import { ragService } from '@/services/rag.service';
import { Conversation } from '@/types/chat.types';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Tab/Section Selector: 'direct' or 'document'
  const [activeSection, setActiveSection] = useState<'direct' | 'document'>('direct');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Hook and State bindings
  const { conversations, loadConversations, selectConversation, deleteConversation } = useChat();
  const { documents, isHistoryLoading } = useRagStore();

  const loadData = useCallback(async () => {
    try {
      await Promise.all([
        loadConversations(),
        ragService.fetchHistory()
      ]);
    } catch (err) {
      console.error('Failed to load history data:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    };
    init();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleSelectDirectChat = async (conv: Conversation) => {
    setIsNavigating(true);
    try {
      await selectConversation(conv);
      router.push('/(main)/(tabs)/chat');
    } catch (err) {
      Alert.alert('Error', 'Failed to load conversation messages.');
    } finally {
      setIsNavigating(false);
    }
  };

  const handleSelectDocumentChat = async (doc: any) => {
    setIsNavigating(true);
    try {
      await ragService.fetchMessages(doc._id);
      router.push('/(main)/(tabs)/rag');
    } catch (err) {
      Alert.alert('Load Error', 'Failed to retrieve document messages.');
    } finally {
      setIsNavigating(false);
    }
  };

  const handleDeleteDirectChat = (id: string) => {
    Alert.alert(
      "Delete Chat", 
      "Are you sure you want to permanently delete this conversation?", 
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteConversation(id) }
      ]
    );
  };

  const handleDeleteDocumentChat = (doc: any) => {
    Alert.alert(
      'Delete Document Room',
      `Are you sure you want to permanently delete "${doc.fileName}" and all associated conversations?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await ragService.deleteDocument(doc._id);
            } catch (err: any) {
              Alert.alert('Delete Error', err.message || 'Could not delete the document.');
            }
          }
        }
      ]
    );
  };

  const renderDirectChatItem = ({ item }: { item: Conversation }) => (
    <View className="flex-row items-center justify-between border-b border-zinc-900 bg-zinc-950/20 px-4">
      <TouchableOpacity 
        className="flex-1 py-4 flex-row items-center"
        onPress={() => handleSelectDirectChat(item)}
        disabled={isNavigating}
      >
        <View className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl items-center justify-center mr-3.5">
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#10B981" />
        </View>
        <View className="ml-0.5 flex-1">
          <Text className="text-white text-[15px] font-semibold" numberOfLines={1}>
            {item.title}
          </Text>
          <Text className="text-zinc-500 text-xs mt-1">
            {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity 
        className="p-4"
        onPress={() => handleDeleteDirectChat(item._id)}
      >
        <Feather name="trash-2" size={16} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  const renderDocumentChatItem = ({ item }: { item: any }) => (
    <View className="flex-row items-center justify-between border-b border-zinc-900 bg-zinc-950/20 px-4">
      <TouchableOpacity 
        className="flex-1 py-4 flex-row items-center"
        onPress={() => handleSelectDocumentChat(item)}
        disabled={isNavigating}
      >
        <View className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 rounded-xl items-center justify-center mr-3.5">
          <Ionicons name="document-text-outline" size={18} color="#3B82F6" />
        </View>
        <View className="ml-0.5 flex-1">
          <Text className="text-white text-[15px] font-semibold" numberOfLines={1}>
            {item.fileName}
          </Text>
          <Text className="text-zinc-500 text-xs mt-1">
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity 
        className="p-4"
        onPress={() => handleDeleteDocumentChat(item)}
      >
        <Feather name="trash-2" size={16} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top + 20 }}>
      {/* Header */}
      <View className="px-5 mb-6 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-3xl font-extrabold tracking-tight">Chat History</Text>
          <Text className="text-zinc-400 text-xs mt-0.5">Resume your previous AI conversations</Text>
        </View>
        {(isLoading || isNavigating) && (
          <ActivityIndicator size="small" color="#10B981" />
        )}
      </View>

      {/* Pill Toggle Navigation */}
      <View className="px-5 mb-5">
        <View className="flex-row bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800/80">
          <TouchableOpacity
            onPress={() => setActiveSection('direct')}
            className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${
              activeSection === 'direct' ? 'bg-emerald-600' : ''
            }`}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={activeSection === 'direct' ? '#FFF' : '#A1A1AA'} />
            <Text className={`text-xs font-bold ml-2 ${activeSection === 'direct' ? 'text-white' : 'text-zinc-400'}`}>
              Direct Chats
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setActiveSection('document')}
            className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${
              activeSection === 'document' ? 'bg-blue-600' : ''
            }`}
          >
            <Ionicons name="document-text-outline" size={16} color={activeSection === 'document' ? '#FFF' : '#A1A1AA'} />
            <Text className={`text-xs font-bold ml-2 ${activeSection === 'document' ? 'text-white' : 'text-zinc-400'}`}>
              Document Chats
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : activeSection === 'direct' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item._id}
          renderItem={renderDirectChatItem}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#10B981"
              colors={["#10B981"]}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center p-6 mx-5 mt-10 bg-zinc-900/10 border border-zinc-900 rounded-3xl min-h-[250px]">
              <Ionicons name="chatbubble-ellipses-outline" size={40} color="#52525B" />
              <Text className="text-zinc-500 font-semibold mt-4 text-center">No standard chats found</Text>
              <Text className="text-zinc-600 text-xs text-center mt-1.5 leading-normal px-4">
                Start a direct conversation in the Chat tab.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item._id}
          renderItem={renderDocumentChatItem}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
              colors={["#3B82F6"]}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center p-6 mx-5 mt-10 bg-zinc-900/10 border border-zinc-900 rounded-3xl min-h-[250px]">
              <Ionicons name="document-text-outline" size={40} color="#52525B" />
              <Text className="text-zinc-500 font-semibold mt-4 text-center">No document rooms found</Text>
              <Text className="text-zinc-600 text-xs text-center mt-1.5 leading-normal px-4">
                Upload textbooks or note PDFs in the RAG tab to index them and start chatting.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}