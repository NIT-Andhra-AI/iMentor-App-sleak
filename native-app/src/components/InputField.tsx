import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export default function InputField({
  label,
  error,
  leftIcon,
  className = '',
  ...props
}: InputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className={`w-full mb-4 ${className}`}>
      <Text className="text-zinc-400 text-sm font-medium mb-1.5">{label}</Text>
      <View
        className={`w-full flex-row items-center bg-zinc-900/60 border rounded-xl px-4 py-3.5 transition-colors duration-200 ${
          isFocused ? 'border-blue-500' : error ? 'border-red-500' : 'border-zinc-850'
        }`}
      >
        {leftIcon && <View className="mr-3">{leftIcon}</View>}
        <TextInput
          className="flex-1 text-white text-base py-0"
          placeholderTextColor="#71717A"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          {...props}
        />
      </View>
      {error && <Text className="text-red-500 text-xs mt-1.5 ml-1">{error}</Text>}
    </View>
  );
}
