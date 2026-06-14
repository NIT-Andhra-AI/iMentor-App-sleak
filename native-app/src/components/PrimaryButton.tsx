import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PrimaryButtonProps {
  text: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export default function PrimaryButton({
  text,
  onPress,
  loading = false,
  disabled = false,
  icon,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.96);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={animatedStyle}
      className={`w-full py-4 rounded-xl flex-row justify-center items-center bg-emerald-500 border border-emerald-400/20 active:bg-emerald-600 ${
        disabled || loading ? 'opacity-60' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <View className="flex-row items-center justify-center">
          {icon && <View className="mr-2">{icon}</View>}
          <Text className="text-white text-base font-semibold tracking-wide">{text}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}
