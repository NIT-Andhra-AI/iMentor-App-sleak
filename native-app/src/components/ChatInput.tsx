import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  value: string;
  onChangeText: (text: string) => void;
  isRecording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  onSend, 
  disabled,
  value,
  onChangeText,
  isRecording,
  onStartRecord,
  onStopRecord
}) => {
  const [inputHeight, setInputHeight] = useState(38);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      setRecordingDuration(0);
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setInputHeight(38);
  };

  return (
    <View className="flex flex-row items-end px-3 py-2 bg-zinc-900 border-t border-zinc-850">
      <View className="flex-1 bg-zinc-800/60 rounded-2xl border border-zinc-700/30 px-3 py-1 mr-2 justify-center">
        {isRecording ? (
          <View className="flex-row items-center h-[30px]">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" style={{ opacity: recordingDuration % 2 === 0 ? 1 : 0.3 }} />
            <Text className="text-red-400 text-sm flex-1 font-medium">Recording Audio...</Text>
            <Text className="text-red-400 text-sm font-mono tracking-widest">{formatTime(recordingDuration)}</Text>
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            className="text-white text-sm max-h-24 py-1"
            placeholder="Message Groq Chatbot..."
            placeholderTextColor="#71717a"
            multiline
            value={value}
            onChangeText={onChangeText}
            onContentSizeChange={(event) => {
              const height = event.nativeEvent.contentSize.height;
              setInputHeight(Math.max(38, height));
            }}
            style={{ height: Math.min(100, inputHeight) }}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            returnKeyType="send"
          />
        )}
      </View>
      {isRecording || (!value.trim() && !disabled) ? (
        <TouchableOpacity
          onPress={isRecording ? onStopRecord : onStartRecord}
          className={`p-2.5 rounded-full items-center justify-center ${
            isRecording ? 'bg-red-500' : 'bg-emerald-600'
          }`}
        >
          <Ionicons 
            name={isRecording ? "pause" : "mic"} 
            size={16} 
            color="#fff" 
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handleSend}
          disabled={!value.trim() || disabled}
          className={`p-2.5 rounded-full items-center justify-center ${
            (!value.trim() || disabled) ? 'bg-zinc-800' : 'bg-emerald-600'
          }`}
        >
          <Ionicons 
            name="send" 
            size={14} 
            color={(!value.trim() || disabled) ? '#71717a' : '#fff'} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
};
export default ChatInput;
