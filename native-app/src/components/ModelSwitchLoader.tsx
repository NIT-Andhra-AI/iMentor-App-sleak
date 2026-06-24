import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useChatStore } from '../store/chat.store';
import { Ionicons } from '@expo/vector-icons';

export const ModelSwitchLoader = () => {
  const isModelSwitching = useChatStore((state) => state.isModelSwitching);
  const switchingToMode = useChatStore((state) => state.switchingToMode);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isModelSwitching) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isModelSwitching, fadeAnim]);

  if (!isModelSwitching) return null;

  const isOnline = switchingToMode === 'online';

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.container}>
        <View 
          style={[
            styles.iconWrapper, 
            { 
              backgroundColor: isOnline ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
              borderColor: isOnline ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)' 
            }
          ]}
        >
          <Ionicons 
            name={isOnline ? "cloud-outline" : "hardware-chip-outline"} 
            size={36} 
            color={isOnline ? "#3B82F6" : "#10B981"} 
          />
        </View>
        
        <Text style={styles.title}>Switching AI Engine</Text>
        
        <Text style={styles.subtitle}>
          {isOnline ? 'Connecting to Groq Online AI...' : 'Configuring Llama 3.2 Offline AI...'}
        </Text>
        
        <ActivityIndicator 
          size="large" 
          color={isOnline ? "#3B82F6" : "#10B981"} 
          style={styles.spinner} 
        />
        
        <Text style={styles.statusText}>Optimizing neural network parameters...</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  container: {
    padding: 28,
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    width: '85%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#A1A1AA',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  spinner: {
    marginBottom: 16,
  },
  statusText: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default ModelSwitchLoader;
