import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useToastStore } from '@/store/toastStore';
import { Feather } from '@expo/vector-icons';

export default function Toast() {
  const { visible, message, type } = useToastStore();
  const translateY = useSharedValue(-100);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(48, { damping: 12 });
    } else {
      translateY.value = withTiming(-100);
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  const getStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-zinc-950/95 border-emerald-500/20',
          text: 'text-emerald-400',
          icon: 'check-circle' as const,
          iconColor: '#10B981',
        };
      case 'error':
        return {
          bg: 'bg-zinc-950/95 border-red-500/20',
          text: 'text-red-400',
          icon: 'alert-circle' as const,
          iconColor: '#EF4444',
        };
      default:
        return {
          bg: 'bg-zinc-950/95 border-blue-500/20',
          text: 'text-blue-400',
          icon: 'info' as const,
          iconColor: '#3B82F6',
        };
    }
  };

  const style = getStyles();

  return (
    <Animated.View
      style={animatedStyle}
      className={`absolute top-0 left-4 right-4 z-[9999] border flex-row items-center p-4 rounded-xl ${style.bg} shadow-2xl`}
    >
      <View className="mr-3">
        <Feather name={style.icon} size={20} color={style.iconColor} />
      </View>
      <Text className="text-zinc-200 text-sm font-medium flex-1 pr-2">{message}</Text>
    </Animated.View>
  );
}
