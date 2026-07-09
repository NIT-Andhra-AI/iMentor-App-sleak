import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView, 
  FlatList, 
  Alert, 
  TextInput 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRagStore, RagDocumentItem } from '../store/rag.store';
import { ragService } from '../services/rag.service';
import { ragRetrievalService } from '../services/ragRetrieval';
import { useWhisper } from '../hooks/useWhisper';
import { useAuthStore } from '../store/authStore';
import { useOfflineChat } from '../hooks/useOfflineChat';
import { useChatStore } from '../store/chat.store';


export default function RagScreen() {
  const insets = useSafeAreaInsets();
  const authStore = useAuthStore();
  const groqApiKey = authStore.user?.groqApiKey;

  // RAG State from Zustand
  const {
    pdfProcessing,
    selectedModel,
    markdownDoc,
    activeFileName,
    activeDocumentId,
    documents,
    isHistoryLoading,
    ragMessages,
    isThinking,
    isStreaming,
    streamingText,
    resetRagSession,
    setSelectedModel,
    setStreamingText
  } = useRagStore();

  // Sync offline model readiness
  const { offlineModelReady, setOfflineModelReady } = useChatStore();
  
  useEffect(() => {
    if (authStore.isModelDownloaded && !offlineModelReady) {
      setOfflineModelReady(true);
    }
  }, [authStore.isModelDownloaded, offlineModelReady]);

  // Load history on mount
  useEffect(() => {
    ragService.fetchHistory();
  }, []);

  // Synchronize/rebuild index when activeDocumentId or markdownDoc changes
  useEffect(() => {
    if (markdownDoc) {
      ragRetrievalService.indexDocument(markdownDoc);
    } else {
      ragRetrievalService.clearCache();
    }
    return () => {
      ragRetrievalService.clearCache();
    };
  }, [markdownDoc, activeDocumentId]);

  // Initialize offline chat client
  const offlineChat = useOfflineChat();
  const isGeneratingOffline = offlineChat.isGenerating;
  const partialResponseOffline = offlineChat.partialResponse;

  useEffect(() => {
    if (isGeneratingOffline) {
      setStreamingText(partialResponseOffline);
    }
  }, [isGeneratingOffline, partialResponseOffline]);

  // Screen Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'document'>('chat');

  // Input states
  const [inputText, setInputText] = useState('');
  const [preRecordText, setPreRecordText] = useState('');
  const [dots, setDots] = useState('');

  // Whisper speech-to-text hook
  const { 
    isDownloading: isVoiceModelDownloading, 
    downloadProgress: voiceModelProgress, 
    isRecording, 
    isStopping, 
    transcribedText, 
    startRecording, 
    stopRecording 
  } = useWhisper();

  // Animation dots for speech transcribing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStopping) {
      interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 300);
    } else {
      setDots('');
    }
    return () => clearInterval(interval);
  }, [isStopping]);

  // Handle voice speech insertion to text input
  useEffect(() => {
    if (transcribedText !== undefined) {
      if (isStopping) {
        const displayText = `Transcribing${dots}`;
        setInputText(preRecordText ? `${preRecordText} ${displayText}` : displayText);
      } else if (transcribedText === '') {
        setInputText(preRecordText);
      } else {
        setInputText(preRecordText ? `${preRecordText} ${transcribedText}` : transcribedText);
      }
    }
  }, [transcribedText, preRecordText, isStopping, dots]);

  const handleStartRecord = () => {
    setPreRecordText(inputText);
    startRecording();
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset.uri) return;
        
        // Start processing the PDF
        await ragService.processPdf(asset.uri, asset.name || 'document.pdf');
        // Once done, select the newly uploaded document
        ragService.fetchHistory();
      }
    } catch (err: any) {
      console.error('Document picker error:', err);
      Alert.alert('Selection Error', err.message || 'Could not select or process the file.');
    }
  };

  const handleSelectDocument = async (doc: RagDocumentItem) => {
    try {
      await ragService.fetchMessages(doc._id);
      setActiveTab('chat');
    } catch (err: any) {
      Alert.alert('Load Error', 'Failed to retrieve document messages.');
    }
  };

  const handleDeleteDocument = (doc: RagDocumentItem) => {
    Alert.alert(
      'Delete Document',
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

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    if (!activeDocumentId) return;

    const msg = inputText;
    setInputText('');

    if (!authStore.isModelDownloaded) {
      Alert.alert(
        'Model Required',
        'The offline Llama model is not downloaded. Please download it in the Settings tab first.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Add user message to database
    let savedUserMsg: any;
    try {
      savedUserMsg = await ragService.saveMessage(activeDocumentId, 'user', msg);
    } catch (err) {
      console.error('Error saving user message offline:', err);
    }

    // Add user message to store
    const userMsgId = savedUserMsg?.id || Math.random().toString(36).substring(7);
    useRagStore.getState().addRagMessage({
      id: userMsgId,
      role: 'user',
      content: msg,
      timestamp: savedUserMsg?.createdAt || new Date().toISOString(),
    });

    useRagStore.getState().setThinking(true);
    useRagStore.getState().setStreaming(true);
    useRagStore.getState().setStreamingText('');

    try {
      const offlineContext = ragRetrievalService.retrieveContext(msg);
      const systemPrompt = `You are iMentor's RAG Assistant. Below is the parsed content of a document.
    
Use ONLY the provided document context to answer the user's questions. If the answer cannot be found in the document, reply with: "I'm sorry, but that information is not available in the uploaded document." Do not use external knowledge.

---
DOCUMENT CONTENT:
${offlineContext}
---`;

      const conversationHistory = useRagStore.getState().ragMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const prompt = `${systemPrompt}\n\n${conversationHistory}\n\nUser: ${msg}\nAssistant:`;

      const reply = await offlineChat.sendOfflineMessage(prompt);
      
      useRagStore.getState().setStreaming(false);
      useRagStore.getState().setThinking(false);

      // Save assistant reply to database
      let savedAssistantMsg: any;
      try {
        savedAssistantMsg = await ragService.saveMessage(activeDocumentId, 'assistant', reply);
      } catch (err) {
        console.error('Error saving assistant message offline:', err);
      }

      const assistantMsgId = savedAssistantMsg?.id || Math.random().toString(36).substring(7);
      useRagStore.getState().addRagMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: reply || useRagStore.getState().streamingText,
        timestamp: savedAssistantMsg?.createdAt || new Date().toISOString(),
      });
      useRagStore.getState().setStreamingText('');
    } catch (err: any) {
      console.error('Offline RAG error:', err);
      useRagStore.getState().setThinking(false);
      useRagStore.getState().setStreaming(false);
      useRagStore.getState().setStreamingText('');
      Alert.alert('Inference Error', err.message || 'Offline Llama inference failed.');
    }
  };

  // Scroll messages to end
  const flatListRef = useRef<FlatList>(null);
  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    if (activeTab === 'chat' && ragMessages.length > 0) {
      scrollToEnd();
    }
  }, [ragMessages.length, streamingText, activeTab]);

  // Loading state during PDF processing
  if (pdfProcessing) {
    return (
      <View className="flex-1 bg-black justify-center items-center px-6" style={{ paddingTop: insets.top }}>
        <View className="items-center mb-8">
          <ActivityIndicator size="large" color="#3B82F6" className="mb-4" />
          <Text className="text-white text-xl font-bold">Analyzing PDF Document</Text>
          <Text className="text-zinc-400 text-xs text-center mt-2 px-6 leading-relaxed">
            Please wait while we upload the document, parse its text, and run the sentence-level cleanup engine to optimize key context.
          </Text>
        </View>
      </View>
    );
  }

  // Check if user is allowed to upload: offline is always enabled
  const isUploadAllowed = true;

  // History view when no document is active
  if (!activeDocumentId) {
    return (
      <View className="flex-1 bg-black px-5" style={{ paddingTop: insets.top + 20 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-white text-2xl font-bold tracking-tight">RAG Document Room</Text>
            <Text className="text-zinc-400 text-xs mt-0.5">Upload and chat with textbooks & notes</Text>
          </View>
        </View>

        {/* Warnings */}
        {!authStore.isModelDownloaded && (
          <View className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 flex-row">
            <Ionicons name="warning" size={20} color="#F59E0B" className="mr-3 mt-0.5" />
            <View className="flex-1">
              <Text className="text-amber-500 font-bold text-sm">Llama Model Offline Required</Text>
              <Text className="text-zinc-400 text-xs mt-1 leading-relaxed">
                The local Llama-3.2 model is not downloaded. Please download it in Settings to enable offline queries.
              </Text>
            </View>
          </View>
        )}

        {/* Upload box */}
        <TouchableOpacity
          onPress={handlePickDocument}
          disabled={!isUploadAllowed}
          className={`border-2 border-dashed rounded-3xl items-center justify-center p-6 bg-zinc-900/20 mb-6 ${
            !isUploadAllowed 
              ? 'border-zinc-800/80 opacity-40' 
              : 'border-zinc-800 active:border-blue-500/40 bg-zinc-900/35'
          }`}
        >
          <View className="w-12 h-12 bg-blue-600/10 rounded-2xl items-center justify-center mb-3.5 border border-blue-500/20">
            <Feather name="upload-cloud" size={24} color="#3B82F6" />
          </View>
          <Text className="text-white text-base font-bold text-center mb-1">Upload PDF Document</Text>
          <Text className="text-zinc-400 text-xs text-center leading-normal px-6">
            Supports textbook and research PDFs. Text is cleaned to avoid redundancy.
          </Text>
        </TouchableOpacity>

        {/* Document History Header */}
        <View className="flex-row items-center justify-between mb-3.5">
          <Text className="text-zinc-400 text-sm font-bold tracking-wide uppercase">Processed Documents</Text>
          {isHistoryLoading && <ActivityIndicator size="small" color="#3B82F6" />}
        </View>

        {/* Document History List */}
        <View className="flex-1 mb-4">
          {isHistoryLoading && documents.length === 0 ? (
            <View className="flex-1 items-center justify-center py-10">
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          ) : documents.length === 0 ? (
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
              <View className="items-center justify-center py-10 bg-zinc-900/10 border border-zinc-900 rounded-3xl px-6">
                <Ionicons name="document-text-outline" size={40} color="#52525B" />
                <Text className="text-zinc-500 font-semibold mt-3 text-center">No documents in room</Text>
                <Text className="text-zinc-600 text-xs text-center mt-1 leading-normal px-4">
                  Upload a PDF document above to begin indexing content and chatting.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              data={documents}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <View className="flex-row items-center bg-zinc-900/30 border border-zinc-900/80 rounded-2xl p-3.5 mb-3">
                  <View className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 rounded-xl items-center justify-center mr-3.5">
                    <Ionicons name="document-text" size={20} color="#3B82F6" />
                  </View>

                  <View className="flex-1 mr-3">
                    <Text className="text-white text-[14px] font-semibold" numberOfLines={1}>
                      {item.fileName}
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <View className="flex-row items-center space-x-2">
                    <TouchableOpacity
                      onPress={() => handleSelectDocument(item)}
                      className="bg-blue-600 active:bg-blue-500 px-3.5 py-1.5 rounded-xl flex-row items-center"
                    >
                      <Ionicons name="chatbox-outline" size={13} color="#FFF" />
                      <Text className="text-white font-bold text-xs ml-1.5">Chat</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDeleteDocument(item)}
                      className="w-8 h-8 items-center justify-center rounded-xl bg-zinc-900 active:bg-zinc-800 border border-zinc-800"
                    >
                      <Feather name="trash-2" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </View>
    );
  }

  // Active chat session view
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#09090B' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        
        {/* Session Header */}
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-zinc-900 bg-black">
          <View className="flex-1 mr-4 flex-row items-center justify-between">
            <TouchableOpacity
              onPress={resetRagSession}
              className="flex-row items-center bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl mr-3"
            >
              <Ionicons name="arrow-back" size={14} color="#A1A1AA" />
              <Text className="text-zinc-400 text-xs font-bold ml-1.5">Back</Text>
            </TouchableOpacity>

            <View className="flex-1 mr-3">
              <Text className="text-white text-sm font-bold" numberOfLines={1}>
                {activeFileName || 'Document'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Toggle Navigation */}
        <View className="flex-row px-5 py-3 bg-zinc-950/40 border-b border-zinc-900">
          <TouchableOpacity 
            onPress={() => setActiveTab('chat')}
            className={`flex-1 py-2 items-center rounded-xl flex-row justify-center ${activeTab === 'chat' ? 'bg-zinc-800 border border-zinc-700' : ''}`}
          >
            <Ionicons name="chatbubbles" size={16} color={activeTab === 'chat' ? '#FFF' : '#71717A'} />
            <Text className={`font-bold text-xs ml-2 ${activeTab === 'chat' ? 'text-white' : 'text-zinc-400'}`}>
              Chat with Doc
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setActiveTab('document')}
            className={`flex-1 py-2 items-center rounded-xl flex-row justify-center ml-3 ${activeTab === 'document' ? 'bg-zinc-800 border border-zinc-700' : ''}`}
          >
            <Ionicons name="document-text" size={16} color={activeTab === 'document' ? '#FFF' : '#71717A'} />
            <Text className={`font-bold text-xs ml-2 ${activeTab === 'document' ? 'text-white' : 'text-zinc-400'}`}>
              Doc Context
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Contents */}
        <View className="flex-1">
          {activeTab === 'chat' ? (
            <View className="flex-1">
              {ragMessages.length === 0 && !isStreaming && !isThinking ? (
                <View className="flex-1 justify-center items-center px-6">
                  <Ionicons name="chatbox-ellipses-outline" size={42} color="#52525B" />
                  <Text className="text-zinc-400 text-sm font-semibold mt-4 text-center">
                    Ask questions about this document.
                  </Text>
                  <Text className="text-zinc-600 text-xs mt-1 text-center leading-relaxed">
                    Answers are locked specifically to the document content. Your session history is automatically saved to the database.
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={ragMessages}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <View className={`mb-4 flex-row ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {item.role === 'assistant' && (
                        <View className="w-7 h-7 bg-blue-600/10 border border-blue-500/20 rounded-full items-center justify-center mr-2.5 mt-1">
                          <Text className="text-blue-500 text-[10px] font-bold">iM</Text>
                        </View>
                      )}
                      <View className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        item.role === 'user' 
                          ? 'bg-zinc-800 border border-zinc-700/60' 
                          : 'bg-zinc-950 border border-zinc-900'
                      }`}>
                        <Text className="text-zinc-100 text-[15px] leading-relaxed">
                          {item.content}
                        </Text>
                      </View>
                    </View>
                  )}
                  ListFooterComponent={
                    <>
                      {isStreaming && streamingText ? (
                        <View className="mb-4 flex-row justify-start">
                          <View className="w-7 h-7 bg-blue-600/10 border border-blue-500/20 rounded-full items-center justify-center mr-2.5 mt-1">
                            <Text className="text-blue-500 text-[10px] font-bold">iM</Text>
                          </View>
                          <View className="max-w-[80%] rounded-2xl px-4 py-3 bg-zinc-950 border border-zinc-900">
                            <Text className="text-zinc-100 text-[15px] leading-relaxed">
                              {streamingText}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      {isThinking ? (
                        <View className="mb-4 flex-row justify-start items-center">
                          <View className="w-7 h-7 bg-blue-600/10 border border-blue-500/20 rounded-full items-center justify-center mr-2.5">
                            <Text className="text-blue-500 text-[10px] font-bold">iM</Text>
                          </View>
                          <ActivityIndicator size="small" color="#3B82F6" />
                        </View>
                      ) : null}
                    </>
                  }
                />
              )}
            </View>
          ) : (
            <ScrollView className="flex-1 px-5 py-4">
              <View className="bg-zinc-900/30 rounded-2xl border border-zinc-900 p-5 mb-8">
                <Text className="text-zinc-200 text-[14px] leading-relaxed font-mono">
                  {markdownDoc}
                </Text>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Whisper Engine Downloading */}
        {isVoiceModelDownloading && (
          <View className="px-4 py-2.5 bg-emerald-950/30 border-t border-emerald-900/50 flex-row items-center justify-between">
            <Text className="text-emerald-400 text-xs font-semibold">Downloading Whisper Voice Engine...</Text>
            <Text className="text-emerald-400 text-xs font-bold">{voiceModelProgress.toFixed(0)}%</Text>
          </View>
        )}

        {/* Input Bar (Only visible in Chat Tab) */}
        {activeTab === 'chat' && (
          <View className="px-4 py-3 border-t border-zinc-900 bg-zinc-950/60">
            <View className="flex-row items-center bg-zinc-900/80 rounded-2xl border border-zinc-800 px-3 py-1.5">
              
              <TouchableOpacity
                onPressIn={handleStartRecord}
                onPressOut={stopRecording}
                className={`w-10 h-10 rounded-xl items-center justify-center mr-2 ${
                  isRecording ? 'bg-red-500/20 border border-red-500/30' : 'bg-zinc-800'
                }`}
              >
                <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={20} color={isRecording ? '#EF4444' : '#A1A1AA'} />
              </TouchableOpacity>

              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder={isRecording ? 'Listening...' : isStopping ? 'Transcribing...' : 'Ask about this document...'}
                placeholderTextColor="#71717A"
                editable={!isThinking && !isStreaming && !isStopping}
                className="flex-1 text-white text-[15px] h-10 px-2"
                onSubmitEditing={handleSendMessage}
              />

              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={!inputText.trim() || isThinking || isStreaming}
                className={`w-10 h-10 rounded-xl items-center justify-center ${
                  inputText.trim() && !isThinking && !isStreaming ? 'bg-blue-600' : 'bg-zinc-800 opacity-50'
                }`}
              >
                <Feather name="send" size={16} color="#FFF" />
              </TouchableOpacity>

            </View>
          </View>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}
