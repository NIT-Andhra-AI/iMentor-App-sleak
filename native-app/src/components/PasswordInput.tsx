import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PasswordInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function PasswordInput({
  label,
  error,
  className = '',
  ...props
}: PasswordInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(true);

  return (
    <View className={`w-full mb-4 ${className}`}>
      <Text className="text-zinc-400 text-sm font-medium mb-1.5">{label}</Text>
      <View
        className={`w-full flex-row items-center bg-zinc-900/60 border rounded-xl px-4 py-3.5 ${
          isFocused ? 'border-blue-500' : error ? 'border-red-500' : 'border-zinc-850'
        }`}
      >
        <Feather name="lock" size={20} color="#71717A" className="mr-3" />
        <TextInput
          className="flex-1 text-white text-base py-0 pr-2"
          placeholderTextColor="#71717A"
          secureTextEntry={isSecure}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          {...props}
        />
        <Pressable onPress={() => setIsSecure(!isSecure)} hitSlop={12}>
          <Feather name={isSecure ? 'eye-off' : 'eye'} size={20} color="#71717A" />
        </Pressable>
      </View>
      {error && <Text className="text-red-500 text-xs mt-1.5 ml-1">{error}</Text>}
    </View>
  );
}
