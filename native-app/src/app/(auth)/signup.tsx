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

export default function SignUpScreen() {
  const signUpAction = useAuthStore((state) => state.signUp);
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Validation errors
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const handleSignUp = async () => {
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    let isValid = true;

    if (!name.trim()) {
      setNameError('Full name is required');
      isValid = false;
    }

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

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      isValid = false;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match');
      isValid = false;
    }

    if (!isValid) return;

    try {
      setLoading(true);
      await signUpAction(name, email, password);
      toast.success('Account created successfully!');
      
      // Navigate to index which will check auth and go to model download prompt
      router.replace('/');
    } catch (err) {
      toast.error('Failed to create account. Please try again.');
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
        <Header title="Create Account" subtitle="Join iMentor and start learning offline" showBackButton />
  
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
          Fill in your details below to create your iMentor account.
        </Text>

        <InputField
          label="Full Name"
          placeholder="John Doe"
          value={name}
          onChangeText={setName}
          error={nameError}
          leftIcon={<Feather name="user" size={20} color="#71717A" />}
        />

        <InputField
          label="Email Address"
          placeholder="john.doe@university.edu"
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

        <PasswordInput
          label="Confirm Password"
          placeholder="••••••••"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={confirmPasswordError}
        />

        <View className="mt-6">
          <PrimaryButton text="Create Account" onPress={handleSignUp} loading={loading} />
        </View>

        <View className="flex-row justify-center items-center mt-8">
          <Text className="text-zinc-500 text-sm">Already have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/login')} hitSlop={8}>
            <Text className="text-emerald-500 text-sm font-semibold">Log In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
   </ScreenContainer>
  );
}
