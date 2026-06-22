import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View, Alert, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble } from '../components/ChatBubble';
import { ChatHeader } from '../components/ChatHeader';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { useChat } from '../hooks/useChat';
import { useOfflineChat } from '../hooks/useOfflineChat';
import { useWhisper } from '../hooks/useWhisper';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chat.store';

const SyncIndicator = () => {
  const syncing = useChatStore((state) => state.syncing);
  const translateX = useRef(new Animated.Value(-400)).current;

  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.timing(translateX, {
          toValue: 400,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      translateX.setValue(-400);
    }
  }, [syncing, translateX]);

  if (!syncing) return null;

  return (
    <View style={{ height: 26, backgroundColor: '#064e3b', overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ translateX }], flexDirection: 'row', alignItems: 'center', width: 400 }}>
        <Ionicons name="cloud-upload" size={14} color="#34d399" style={{ marginRight: 8 }} />
        <Text style={{ color: '#34d399', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }}>
          Syncing offline chats to MongoDB...
        </Text>
      </Animated.View>
    </View>
  );
};

export const ChatScreen = () => {
  const insets = useSafeAreaInsets();
  const offlineChat = useOfflineChat();
  const { isModelDownloaded } = useAuthStore();
  const { 
    messages, 
    isStreaming, 
    isThinking, 
    streamingText, 
    sendMessage,
    isConnected,
    createNewChat,
    setOfflineModelReady
  } = useChat(offlineChat);

  const { isDownloading, downloadProgress, isRecording, isStopping, transcribedText, startRecording, stopRecording } = useWhisper();
  const [inputText, setInputText] = React.useState('');
  const [preRecordText, setPreRecordText] = React.useState('');
  const [dots, setDots] = React.useState('');

  // Animate the "Transcribing" dots
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

  const handleStartRecord = () => {
    setPreRecordText(inputText);
    startRecording();
  };

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

  const flatListRef = useRef<FlatList>(null);

  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
  };

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, streamingText]);

  const prevIsConnected = useRef(isConnected);

  useEffect(() => {
    if (prevIsConnected.current && !isConnected) {
      if (isModelDownloaded) {
        Alert.alert(
          'Connection Lost',
          'You are disconnected from the internet. Instantly switching to your offline local model.',
          [{ text: 'OK' }]
        );
        createNewChat();
        setOfflineModelReady(true);
      }
    }
    prevIsConnected.current = isConnected;
  }, [isConnected, isModelDownloaded, createNewChat, setOfflineModelReady]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#09090B' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View 
        style={{
          flex: 1,
          paddingTop: insets.top,
        }}
      >
        <ChatHeader />
        <SyncIndicator />

        <View style={{ flex: 1 }}>
          {messages.length === 0 && !isStreaming && !isThinking ? (
            <View className="flex-1 justify-center px-6">
              <View className="items-center mb-8">
                <View className="w-14 h-14 bg-emerald-500/10 rounded-2xl items-center justify-center mb-4 border border-emerald-500/20">
                  <Ionicons name="chatbubble-ellipses-outline" size={26} color="#10B981" />
                </View>
                <Text className="text-white text-lg font-bold text-center">
                  How can I help you today?
                </Text>
                <Text style={{ color: '#A1A1AA' }} className="text-xs text-center mt-2">
                  Start a conversation by typing below.
                </Text>
              </View>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => item._id || index.toString()}
              renderItem={({ item }) => <ChatBubble message={item} />}
              contentContainerStyle={{ paddingVertical: 10 }}
              onContentSizeChange={scrollToEnd}
              onLayout={scrollToEnd}
              ListFooterComponent={
                <>
                  {isStreaming && streamingText ? (
                    <ChatBubble 
                      message={{
                        conversationId: '',
                        role: 'assistant',
                        content: streamingText,
                        createdAt: new Date()
                      }}
                    />
                  ) : null}
                  {isThinking ? <TypingIndicator /> : null}
                </>
              }
            />
          )}
        </View>

        {isDownloading && (
          <View className="px-4 py-2 bg-emerald-900/50 border-t border-emerald-800/50 flex-row items-center justify-between">
            <Text className="text-emerald-400 text-xs font-semibold">Downloading Whisper Engine...</Text>
            <Text className="text-emerald-400 text-xs font-bold">{downloadProgress.toFixed(1)}%</Text>
          </View>
        )}

        <ChatInput 
          onSend={(text) => {
            sendMessage(text);
            setInputText('');
          }} 
          disabled={isStreaming || isThinking}
          value={inputText}
          onChangeText={setInputText}
          isRecording={isRecording}
          onStartRecord={handleStartRecord}
          onStopRecord={stopRecording}
        />
      </View>
    </KeyboardAvoidingView>
  );
};
export default ChatScreen;
