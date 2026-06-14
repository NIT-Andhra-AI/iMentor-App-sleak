import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  rightAction?: React.ReactNode;
  onBackPress?: () => void;
}

export default function Header({
  title,
  subtitle,
  showBackButton = false,
  rightAction,
  onBackPress,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={{
        paddingTop: insets.top > 0 ? insets.top + 8 : 16,
      }}
      className="w-full flex-row items-center justify-between px-5 pb-4 bg-black border-b border-zinc-900/60"
    >
      <View className="flex-row items-center flex-1">
        {showBackButton && (
          <Pressable
            onPress={handleBack}
            className="mr-3.5 bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 active:bg-zinc-800"
            hitSlop={12}
          >
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </Pressable>
        )}
        <View className="flex-1 justify-center">
          <Text className="text-white text-xl font-bold tracking-tight">{title}</Text>
          {subtitle && (
            <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {rightAction && <View className="ml-3">{rightAction}</View>}
    </View>
  );
}
