import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import InputField from '@/components/InputField';
import PasswordInput from '@/components/PasswordInput';
import PrimaryButton from '@/components/PrimaryButton';
import Header from '@/components/Header';
import ScreenContainer from '@/components/ScreenContainer';

export default function LoginScreen() {
  const loginAction = useAuthStore((state) => state.login);
  const insets = useSafeAreaInsets();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    let isValid = true;

    if (!email) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }

    if (!isValid) return;

    try {
      setLoading(true);
      await loginAction(email, password);
      toast.success('Successfully logged in!');
      
      // Navigate to index which redirects to post login download prompt
      router.replace('/');
    } catch (err) {
      toast.error('Failed to log in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer ignoreTop ignoreHorizontal ignoreBottom>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Header title="Welcome Back" subtitle="Log in to access your offline AI study tools" showBackButton />
        
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: insets.bottom > 0 ? insets.bottom + 24 : 40,
          }}
        >
        <Text className="text-zinc-400 text-sm mb-8">
          Enter your registered email and password to log back in.
        </Text>

        <InputField
          label="Email Address"
          placeholder="name@university.edu"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          leftIcon={<Feather name="mail" size={20} color="#71717A" />}
        />

        <PasswordInput
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
        />

        {/* Options Row */}
        <View className="flex-row justify-between items-center mt-2 mb-8 w-full">
          <Pressable
            onPress={() => setRememberMe(!rememberMe)}
            className="flex-row items-center space-x-2.5 py-1"
            hitSlop={8}
          >
            <View
              className={`w-5 h-5 rounded border items-center justify-center ${
                rememberMe ? 'bg-blue-500 border-blue-500' : 'border-zinc-800 bg-zinc-900/40'
              }`}
            >
              {rememberMe && <Feather name="check" size={12} color="white" />}
            </View>
            <Text className="text-zinc-400 text-sm ml-2">Remember Me</Text>
          </Pressable>

          <Pressable
            onPress={() => toast.info('Password reset is not configured in this demo.')}
            className="py-1"
            hitSlop={8}
          >
            <Text className="text-blue-400 text-sm font-medium">Forgot Password?</Text>
          </Pressable>
        </View>

        <PrimaryButton text="Log In" onPress={handleLogin} loading={loading} />

        <View className="flex-row justify-center items-center mt-8">
          <Text className="text-zinc-500 text-sm">Don't have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
            <Text className="text-emerald-500 text-sm font-semibold">Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
   </ScreenContainer>
  );
}
