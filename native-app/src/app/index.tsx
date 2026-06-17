import { useAuthStore } from '@/store/authStore';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { isModelDownloaded as verifyModelExists } from '@/services/modelDownload.service';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isModelDownloaded = useAuthStore((state) => state.isModelDownloaded);
  const setDownloaded = useAuthStore((state) => state.setDownloaded);
  const modelBypassed = useAuthStore((state) => state.modelBypassed);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const [isCheckingDisk, setIsCheckingDisk] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Check local storage for JWT token and model
    Promise.all([
      initializeAuth(),
      verifyModelExists()
    ]).then(([_, exists]) => {
      if (mounted) {
        if (exists) {
          setDownloaded(true);
        }
        setIsCheckingDisk(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  if (isCheckingDisk || !isInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/landing" />;
  }

  if (!isModelDownloaded && !modelBypassed) {
    return <Redirect href="/model-download-prompt" />;
  }

  return <Redirect href="/(main)/(tabs)/chat" />;
}