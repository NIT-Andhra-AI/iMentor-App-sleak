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
  Image, 
  TextInput 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRagStore, PdfProcessStep } from '../store/rag.store';
import { ragService } from '../services/rag.service';
import { useWhisper } from '../hooks/useWhisper';
import { useAuthStore } from '../store/authStore';
import { downloadVlmModel, isVlmModelDownloaded as verifyVlmDownloaded } from '../services/vlmDownload.service';
import { useOfflineChat } from '../hooks/useOfflineChat';
import { useChatStore } from '../store/chat.store';

function getRelevantContext(doc: string | null, query: string, maxCharacters: number = 3000): string {
  if (!doc) return '';
  if (doc.length <= maxCharacters) return doc;

  const paragraphs = doc.split(/\n+/);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (queryWords.length === 0) {
    return doc.slice(0, maxCharacters) + '\n\n[Content truncated for offline model...]';
  }

  const scored = paragraphs.map(p => {
    let score = 0;
    const lowerP = p.toLowerCase();
    queryWords.forEach(word => {
      if (lowerP.includes(word)) {
        score += 1;
      }
    });
    return { paragraph: p, score };
  });

  const relevantParagraphs = scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.paragraph);

  let combined = '';
  for (const p of relevantParagraphs) {
    if ((combined.length + p.length) > maxCharacters) {
      break;
    }
    combined += p + '\n\n';
  }

  if (combined.length < maxCharacters / 2) {
    const remainingSpace = maxCharacters - combined.length;
    combined = doc.slice(0, remainingSpace) + '\n\n---\n\n' + combined;
  }

  return combined.trim() + '\n\n[Content truncated for offline model...]';
}

export default function RagScreen() {
  const insets = useSafeAreaInsets();
  const authStore = useAuthStore();
  const groqApiKey = authStore.user?.groqApiKey;

  // RAG State from Zustand
  const {
    vlmModelReady,
    isVlmDownloading,
    vlmDownloadProgress,
    pdfProcessing,
    pdfProcessStep,
    captionTotalImages,
    captionCurrentIndex,
    cancelCaptioningRequested,
    selectedModel,
    markdownDoc,
    activeFileName,
    ragMessages,
    isThinking,
    isStreaming,
    streamingText,
    resetRagSession,
    setVlmModelReady,
    requestCancelCaptioning,
    setSelectedModel,
    setStreamingText
  } = useRagStore();

  // Sync offline model readiness from AuthStore to ChatStore so JNI layer loads model
  const { offlineModelReady, setOfflineModelReady } = useChatStore();
  
  useEffect(() => {
    if (authStore.isModelDownloaded && !offlineModelReady) {
      setOfflineModelReady(true);
    }
  }, [authStore.isModelDownloaded, offlineModelReady]);

  // Initialize offline chat client
  const offlineChat = useOfflineChat();
  const isGeneratingOffline = offlineChat.isGenerating;
  const partialResponseOffline = offlineChat.partialResponse;

  useEffect(() => {
    if (selectedModel === 'offline' && isGeneratingOffline) {
      setStreamingText(partialResponseOffline);
    }
  }, [isGeneratingOffline, partialResponseOffline, selectedModel]);

  // Background VLM model downloader
  useEffect(() => {
    const triggerBgDownload = async () => {
      const downloaded = await verifyVlmDownloaded();
      if (!downloaded && !isVlmDownloading) {
        downloadVlmModel((progress, speed) => {}).catch(() => {});
      } else if (downloaded) {
        setVlmModelReady(true);
      }
    };
    triggerBgDownload();
  }, []);

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
      }
    } catch (err: any) {
      console.error('Document picker error:', err);
      Alert.alert('Selection Error', err.message || 'Could not select or process the file.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const msg = inputText;
    setInputText('');

    if (selectedModel === 'offline') {
      if (!authStore.isModelDownloaded) {
        Alert.alert(
          'Model Required',
          'The offline Llama model is not downloaded. Please download it in the Settings tab first.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Add user message
      const userMsgId = Math.random().toString(36).substring(7);
      useRagStore.getState().addRagMessage({
        id: userMsgId,
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString(),
      });

      useRagStore.getState().setThinking(true);
      useRagStore.getState().setStreaming(true);
      useRagStore.getState().setStreamingText('');

      try {
        const offlineContext = getRelevantContext(markdownDoc, msg);
        const systemPrompt = `You are iMentor's RAG Assistant. Below is the parsed content of a document (including on-device descriptions of any extracted images).
    
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

        const assistantMsgId = Math.random().toString(36).substring(7);
        useRagStore.getState().addRagMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: reply || useRagStore.getState().streamingText,
          timestamp: new Date().toISOString(),
        });
        useRagStore.getState().setStreamingText('');
      } catch (err: any) {
        console.error('Offline RAG error:', err);
        useRagStore.getState().setThinking(false);
        useRagStore.getState().setStreaming(false);
        useRagStore.getState().setStreamingText('');
        Alert.alert('Inference Error', err.message || 'Offline Llama inference failed.');
      }
    } else {
      // Online mode (Groq)
      try {
        await ragService.askQuestion(msg);
      } catch (err: any) {
        Alert.alert('Query Error', err.message || 'Failed to send query.');
      }
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

  // Steps Progress UI Renderer
  const renderProgressStep = (
    stepName: string, 
    label: string, 
    activeSteps: PdfProcessStep[], 
    completedSteps: PdfProcessStep[]
  ) => {
    const isActive = activeSteps.includes(pdfProcessStep);
    const isCompleted = completedSteps.includes(pdfProcessStep);

    return (
      <View className="flex-row items-center mb-5 px-4 py-3 bg-zinc-900/50 rounded-2xl border border-zinc-800/60">
        <View className="w-8 h-8 rounded-full items-center justify-center mr-4">
          {isCompleted ? (
            <View className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
              <Ionicons name="checkmark" size={16} color="#10B981" />
            </View>
          ) : isActive ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <View className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center">
              <Text className="text-zinc-500 text-xs font-bold font-mono">•</Text>
            </View>
          )}
        </View>
        <View className="flex-1">
          <Text className={`font-semibold text-sm ${isActive ? 'text-blue-400' : isCompleted ? 'text-zinc-400' : 'text-zinc-600'}`}>
            {stepName}
          </Text>
          <Text className="text-zinc-500 text-xs mt-0.5">
            {label}
          </Text>
        </View>
      </View>
    );
  };

  // Renders the document processing view
  if (pdfProcessing) {
    return (
      <View className="flex-1 bg-black justify-center px-6" style={{ paddingTop: insets.top }}>
        <View className="items-center mb-8">
          <Ionicons name="document-text-outline" size={48} color="#3B82F6" />
          <Text className="text-white text-xl font-bold mt-4">Analyzing Document</Text>
          <Text className="text-zinc-400 text-xs text-center mt-2 px-6">
            Please wait while we parse your PDF, extract assets, and generate image captions on-device.
          </Text>
        </View>

        <View className="w-full max-w-md mx-auto">
          {renderProgressStep(
            '1. Uploading Document',
            'Sending PDF file to processing engine...',
            ['uploading'],
            ['extracting_images', 'captioning', 'compiling']
          )}

          {renderProgressStep(
            '2. Extracting Text & Images',
            'Parsing layout structure and retrieving assets...',
            ['extracting_images'],
            ['captioning', 'compiling']
          )}

          {renderProgressStep(
            '3. On-Device Image Captioning',
            captionTotalImages > 0 
              ? `Generating description for image ${captionCurrentIndex + 1} of ${captionTotalImages}...`
              : 'Detecting embedded images...',
            ['captioning'],
            ['compiling']
          )}

          {renderProgressStep(
            '4. Compiling Document Context',
            'Assembling structured Markdown output...',
            ['compiling'],
            []
          )}

          {pdfProcessStep === 'captioning' && (
            <TouchableOpacity
              onPress={requestCancelCaptioning}
              disabled={cancelCaptioningRequested}
              className={`mt-6 py-3.5 px-6 rounded-2xl flex-row items-center justify-center border ${
                cancelCaptioningRequested
                  ? 'bg-zinc-950 border-zinc-900 opacity-60'
                  : 'bg-zinc-900 active:bg-zinc-800 border-zinc-800'
              }`}
            >
              {cancelCaptioningRequested ? (
                <>
                  <ActivityIndicator size="small" color="#A1A1AA" className="mr-2" />
                  <Text className="text-zinc-500 font-bold text-sm">
                    Skipping & Compiling...
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="fast-forward" size={16} color="#FFF" />
                  <Text className="text-white font-bold ml-2 text-sm">
                    Skip Remaining Images & Compile
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Renders the upload / onboarding state
  if (!markdownDoc) {
    return (
      <View className="flex-1 bg-black px-6" style={{ paddingTop: insets.top + 20 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
          <View className="flex-row items-center bg-zinc-900/60 p-1 rounded-xl border border-zinc-800">
            <TouchableOpacity
              onPress={() => setSelectedModel('online')}
              className={`px-3 py-1.5 rounded-lg flex-row items-center ${selectedModel === 'online' ? 'bg-blue-600' : ''}`}
            >
              <Ionicons name="cloud-outline" size={14} color={selectedModel === 'online' ? '#FFF' : '#A1A1AA'} />
              <Text className={`text-xs font-bold ml-1.5 ${selectedModel === 'online' ? 'text-white' : 'text-zinc-400'}`}>
                Online
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => setSelectedModel('offline')}
              className={`px-3 py-1.5 rounded-lg flex-row items-center ml-1 ${selectedModel === 'offline' ? 'bg-emerald-600' : ''}`}
            >
              <Ionicons name="phone-portrait-outline" size={14} color={selectedModel === 'offline' ? '#FFF' : '#A1A1AA'} />
              <Text className={`text-xs font-bold ml-1.5 ${selectedModel === 'offline' ? 'text-white' : 'text-zinc-400'}`}>
                Offline
              </Text>
            </TouchableOpacity>
          </View>
          
          <View className="flex-row items-center bg-zinc-900 border border-zinc-800 px-3.5 py-1.5 rounded-full">
            <View className={`w-2.5 h-2.5 rounded-full ${vlmModelReady ? 'bg-emerald-500' : isVlmDownloading ? 'bg-blue-500' : 'bg-amber-500'} mr-2`} />
            <Text className="text-zinc-300 font-bold text-xs">
              {vlmModelReady 
                ? 'VLM Local' 
                : isVlmDownloading 
                  ? `Downloading VLM (${Math.round(vlmDownloadProgress * 100)}%)` 
                  : 'VLM Pending'}
            </Text>
          </View>
        </View>

        {/* Info Banner if VLM not ready */}
        {!vlmModelReady && (
          <View className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 flex-row">
            <Ionicons name="warning" size={20} color="#F59E0B" className="mr-3" />
            <View className="flex-1">
              <Text className="text-amber-500 font-bold text-[14px]">Image Captioner Offline</Text>
              <Text className="text-zinc-400 text-xs mt-1 leading-relaxed">
                LiquidAI Vision model is not downloaded. Images extracted from PDFs will be skipped. You can download the model in the Settings tab.
              </Text>
            </View>
          </View>
        )}

        {/* Info Banner if Groq Key not configured */}
        {!groqApiKey && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex-row">
            <Feather name="key" size={20} color="#EF4444" className="mr-3" />
            <View className="flex-1">
              <Text className="text-red-500 font-bold text-[14px]">Groq API Key Required</Text>
              <Text className="text-zinc-400 text-xs mt-1 leading-relaxed">
                A Groq API key is needed to query the document context. Please save your API Key in the Settings tab to begin.
              </Text>
            </View>
          </View>
        )}

        {/* Large upload card */}
        <TouchableOpacity
          onPress={handlePickDocument}
          disabled={!groqApiKey}
          className={`flex-1 max-h-[360px] border-2 border-dashed rounded-3xl items-center justify-center p-8 bg-zinc-900/30 ${
            !groqApiKey 
              ? 'border-zinc-800 opacity-50' 
              : 'border-zinc-800 active:border-blue-500/40 bg-zinc-900/40'
          }`}
        >
          <View className="w-16 h-16 bg-blue-600/10 rounded-2xl items-center justify-center mb-5 border border-blue-500/20">
            <Feather name="upload-cloud" size={32} color="#3B82F6" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">Upload PDF Document</Text>
          <Text className="text-zinc-400 text-xs text-center leading-relaxed px-4">
            Supports documents containing text, diagrams, and figures. Embedded images will be processed on-device.
          </Text>
          
          <View className="bg-zinc-800/80 px-4 py-2 rounded-xl mt-6">
            <Text className="text-zinc-300 font-bold text-xs">Choose PDF File</Text>
          </View>
        </TouchableOpacity>

        {/* Feature Cards */}
        <View className="mt-8 space-y-4">
          <View className="flex-row items-start">
            <View className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center mr-3 mt-0.5">
              <Ionicons name="document-text" size={14} color="#A1A1AA" />
            </View>
            <View className="flex-1">
              <Text className="text-zinc-300 font-semibold text-[14px]">Layout Text Parsing</Text>
              <Text className="text-zinc-500 text-xs mt-0.5">Extracts structured textual details, tables, and formats from PDF pages.</Text>
            </View>
          </View>
          
          <View className="flex-row items-start mt-4">
            <View className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center mr-3 mt-0.5">
              <Ionicons name="eye" size={14} color="#A1A1AA" />
            </View>
            <View className="flex-1">
              <Text className="text-zinc-300 font-semibold text-[14px]">On-Device Vision Analysis</Text>
              <Text className="text-zinc-500 text-xs mt-0.5">Captions images directly on-device using quantized ExecuTorch models, keeping data private.</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Renders the chat session with document
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#09090B' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        
        {/* Session Header */}
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-zinc-800/80">
          <View className="flex-1 mr-4 flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-white text-base font-bold" numberOfLines={1}>
                {activeFileName || 'Document'}
              </Text>
            </View>
            
            <View className="flex-row items-center bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
              <TouchableOpacity
                onPress={() => setSelectedModel('online')}
                className={`px-2 py-1 rounded-md flex-row items-center ${selectedModel === 'online' ? 'bg-blue-600' : ''}`}
              >
                <Ionicons name="cloud-outline" size={11} color={selectedModel === 'online' ? '#FFF' : '#A1A1AA'} />
                <Text className={`text-[10px] font-extrabold ml-1 ${selectedModel === 'online' ? 'text-white' : 'text-zinc-400'}`}>
                  Online
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => setSelectedModel('offline')}
                className={`px-2 py-1 rounded-md flex-row items-center ml-0.5 ${selectedModel === 'offline' ? 'bg-emerald-600' : ''}`}
              >
                <Ionicons name="phone-portrait-outline" size={11} color={selectedModel === 'offline' ? '#FFF' : '#A1A1AA'} />
                <Text className={`text-[10px] font-extrabold ml-1 ${selectedModel === 'offline' ? 'text-white' : 'text-zinc-400'}`}>
                  Offline
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row items-center space-x-2">
            <TouchableOpacity
              onPress={resetRagSession}
              className="w-9 h-9 bg-zinc-900 rounded-full items-center justify-center border border-zinc-800"
            >
              <Ionicons name="refresh" size={18} color="#EF4444" />
            </TouchableOpacity>
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
                    Ask questions about the uploaded document.
                  </Text>
                  <Text className="text-zinc-600 text-xs mt-1 text-center leading-relaxed">
                    Answers are locked specifically to the document context and verified on-device image details.
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
                <Text className="text-zinc-200 text-[15px] leading-relaxed font-mono">
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
