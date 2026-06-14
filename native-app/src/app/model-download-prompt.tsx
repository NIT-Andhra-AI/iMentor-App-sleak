import React from 'react';
import { View, Text, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import ScreenContainer from '@/components/ScreenContainer';

export default function ModelDownloadPromptScreen() {
  const setBypassed = useAuthStore((state) => state.setBypassed);

  const handleDownloadNow = () => {
    router.push('/model-download');
  };

  const handleMaybeLater = () => {
    setBypassed(true);
    router.replace('/(main)/(tabs)/chat');
  };

  return (
    <ScreenContainer
      ignoreHorizontal
      style={{
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 24,
      }}
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative Blur Backgrounds */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-[80px]" />
      <View className="absolute top-1/2 -left-40 w-96 h-96 rounded-full bg-blue-500/10 blur-[100px]" />

      {/* Header Info */}
      <View className="flex-1 justify-center items-center px-4">
        <View className="w-20 h-20 rounded-[24px] bg-zinc-900 border border-zinc-800 flex justify-center items-center mb-8 relative">
          <View className="absolute inset-0 rounded-[24px] border border-emerald-500/20 m-1" />
          <View className="absolute inset-0 rounded-[24px] border border-blue-500/25 m-2" />
          <Feather name="cpu" size={36} color="#10B981" />
        </View>

        <Text className="text-white text-3xl font-extrabold text-center tracking-tight">
          Download Gemma Model
        </Text>
        <Text className="text-emerald-500 text-xs font-bold tracking-widest uppercase mt-2">
          Gemma-2-2B-Instruct Quantized
        </Text>

        <View className="mt-8 bg-zinc-950/40 border border-zinc-900 rounded-2xl p-5 w-full">
          <View className="flex-row items-center mb-3">
            <Feather name="info" size={16} color="#3B82F6" className="mr-2" />
            <Text className="text-white text-sm font-bold ml-2">Why run locally?</Text>
          </View>
          <Text className="text-zinc-400 text-xs leading-relaxed">
            By running Gemma directly on your device, all conversations stay private, and you don't require an active internet connection to learn.
          </Text>

          <View className="border-t border-zinc-900 mt-4 pt-4 space-y-2.5">
            <View className="flex-row justify-between">
              <Text className="text-zinc-500 text-xs">Model Size</Text>
              <Text className="text-zinc-300 text-xs font-semibold">1.20 GB</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-500 text-xs">Required RAM</Text>
              <Text className="text-zinc-300 text-xs font-semibold">~1.8 GB</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="w-full space-y-4">
        <PrimaryButton
          text="Download Now"
          onPress={handleDownloadNow}
          icon={<Feather name="download" size={18} color="white" />}
        />

        <View className="mt-3">
          <SecondaryButton
            text="Maybe Later"
            onPress={handleMaybeLater}
            icon={<Feather name="clock" size={18} color="#A1A1AA" />}
          />
        </View>

        <Text className="text-center text-zinc-650 text-[10px] mt-6">
          Requires a Wi-Fi connection for downloading large weights.
        </Text>
      </View>
    </ScreenContainer>
  );
}
