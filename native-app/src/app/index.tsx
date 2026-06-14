import { useAuthStore } from '@/store/authStore';
import { Redirect } from 'expo-router';
import React from 'react';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isModelDownloaded = useAuthStore((state) => state.isModelDownloaded);
  const modelBypassed = useAuthStore((state) => state.modelBypassed);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/landing" />;
  }

  if (!isModelDownloaded && !modelBypassed) {
    return <Redirect href="/model-download-prompt" />;
  }

  return <Redirect href="/(main)/(tabs)/chat" />;
}