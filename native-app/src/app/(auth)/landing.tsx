import React, { useEffect } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import ScreenContainer from '@/components/ScreenContainer';

export default function LandingScreen() {
  // Animation values
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(20);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    // Entrance animations
    logoScale.value = withTiming(1, { duration: 800 });
    logoOpacity.value = withTiming(1, { duration: 800 });
    
    textOpacity.value = withDelay(400, withTiming(1, { duration: 800 }));
    textTranslateY.value = withDelay(400, withTiming(0, { duration: 800 }));
    
    buttonsOpacity.value = withDelay(800, withTiming(1, { duration: 800 }));
    buttonsTranslateY.value = withDelay(800, withTiming(0, { duration: 800 }));

    // Pulsing background glow
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 2500 }),
        withTiming(0.2, { duration: 2500 })
      ),
      -1,
      true
    );
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <ScreenContainer
      ignoreHorizontal
      style={{
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 24,
      }}
      className="relative overflow-hidden"
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative Glowing Orbs */}
      <Animated.View
        style={glowAnimatedStyle}
        className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-[80px]"
      />
      <Animated.View
        style={glowAnimatedStyle}
        className="absolute top-1/2 -right-40 w-96 h-96 rounded-full bg-blue-500/10 blur-[100px]"
      />

      {/* Top Branding Section */}
      <View className="flex-1 justify-center items-center">
        {/* Glowing Logo Circle */}
        <Animated.View
          style={logoAnimatedStyle}
          className="w-24 h-24 rounded-[28px] bg-zinc-900 border border-zinc-800 flex justify-center items-center mb-8 shadow-2xl relative"
        >
          {/* Subtle green/blue double ring */}
          <View className="absolute inset-0 rounded-[28px] border border-emerald-500/20 m-1" />
          <View className="absolute inset-0 rounded-[28px] border border-blue-500/25 m-2.5" />
          
          <Feather name="layers" size={42} color="#22C55E" />
        </Animated.View>

        {/* Text Area */}
        <Animated.View style={textAnimatedStyle} className="items-center px-4">
          <Text className="text-white text-4xl font-extrabold tracking-tight text-center">
            iMentor
          </Text>
          <Text className="text-emerald-500 text-sm font-semibold tracking-widest uppercase mt-1">
            Offline AI Assistant
          </Text>
          <Text className="text-zinc-400 text-base text-center mt-5 leading-relaxed font-normal">
            Master Machine Learning and Deep Learning concepts completely offline. Learn and chat on the go.
          </Text>
        </Animated.View>
      </View>

      {/* Action Buttons Section */}
      <Animated.View style={buttonsAnimatedStyle} className="w-full space-y-4">
        <PrimaryButton
          text="Log In"
          onPress={() => router.push('/(auth)/login')}
          icon={<Feather name="log-in" size={18} color="white" />}
        />
        
        <View className="mt-3">
          <SecondaryButton
            text="Create Account"
            onPress={() => router.push('/(auth)/signup')}
            icon={<Feather name="user-plus" size={18} color="#A1A1AA" />}
          />
        </View>

        <Text className="text-center text-zinc-650 text-[11px] mt-6 leading-normal">
          By continuing, you agree to iMentor's Terms of Service & Privacy Policy.
        </Text>
      </Animated.View>
    </ScreenContainer>
  );
}
