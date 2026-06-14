import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const Index = () => {
  return (
    <SafeAreaView className="flex-1">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="bg-blue-600 h-[1500px] w-full" />
        <View className="bg-red-600 h-[1500px] w-full" />
        <View className="bg-green-600 h-[1500px] w-full" />
        <View className="bg-yellow-600 h-[1500px] w-full" />
        <View className="bg-pink-600 h-[1500px] w-full" />
        <View className="bg-purple-600 h-[1500px] w-full" />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Index;