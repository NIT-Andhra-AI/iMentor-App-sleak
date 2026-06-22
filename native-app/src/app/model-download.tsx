import React, { useEffect, useState } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import ScreenContainer from '@/components/ScreenContainer';

export default function ModelDownloadScreen() {
  const setDownloaded = useAuthStore((state) => state.setDownloaded);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('14.2 MB/s');

  useEffect(() => {
    let mounted = true;

    const startDownload = async () => {
      const { downloadModel } = await import('@/services/modelDownload.service');
      const success = await downloadModel((prog, speed) => {
        if (mounted) {
          setProgress(Math.floor(prog * 100));
          setDownloadSpeed(`${speed} MB`);
        }
      });

      if (success && mounted) {
        toast.success('Llama 3.2 weights downloaded and verified successfully!');
        setDownloaded(true);
        router.replace('/(main)/(tabs)/chat');
      } else if (!success && mounted) {
        toast.error('Download failed due to network interruption. Please try again.');
        setProgress(0);
        setDownloadSpeed('0.0 MB');
      }
    };

    startDownload();

    return () => {
      mounted = false;
    };
  }, []);

  const downloadedMB = ((progress / 100) * 1280).toFixed(1);

  return (
    <ScreenContainer
      ignoreHorizontal
      style={{
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
      }}
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative Blur Orbs */}
      <View className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-blue-500/10 blur-[80px]" />

      <View className="flex-1 justify-center items-center px-4 w-full">
        {/* Animated Spin Loader Icon */}
        <View className="w-20 h-20 rounded-[24px] bg-zinc-900 border border-zinc-800 flex justify-center items-center mb-8 relative">
          <View className="absolute inset-0 rounded-[24px] border border-blue-500/20 m-1" />
          <Feather name="download-cloud" size={32} color="#3B82F6" />
        </View>

        <Text className="text-white text-2xl font-extrabold text-center tracking-tight">
          Downloading Llama 3.2
        </Text>
        <Text className="text-zinc-500 text-xs mt-1 font-semibold tracking-wide uppercase">
          Do not close the app or lock your screen
        </Text>

        {/* Progress Display Card */}
        <View className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-6 w-full mt-10">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-zinc-400 text-xs font-semibold">Progress</Text>
            <Text className="text-blue-400 text-sm font-extrabold">{progress}%</Text>
          </View>

          {/* Bar track */}
          <View className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden mb-4">
            <View
              style={{ width: `${progress}%` }}
              className="h-full bg-blue-500 rounded-full"
            />
          </View>

          <View className="flex-row justify-between items-center border-t border-zinc-900 pt-4">
            <View>
              <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Downloaded</Text>
              <Text className="text-zinc-300 text-xs font-semibold mt-0.5">{downloadedMB} MB / 1.28 GB</Text>
            </View>

            <View className="items-end">
              <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Speed</Text>
              <Text className="text-emerald-400 text-xs font-semibold mt-0.5">{downloadSpeed}</Text>
            </View>
          </View>
        </View>
      </View>

      <Text className="text-center text-zinc-600 text-[10px]">
        Quantizing weights dynamically to match active CPU architecture.
      </Text>
    </ScreenContainer>
  );
}
