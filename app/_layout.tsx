
import { Colors } from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/ctx/AuthContext';
import { ThemeProvider as AppThemeProvider } from '@/ctx/ThemeContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ONBOARDING_KEY } from '@/app/onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setOnboardingDone(v === '1'))
      .catch(() => setOnboardingDone(true))
      .finally(() => setOnboardingChecked(true));
  }, []);

  useEffect(() => {
    if (isLoading || !onboardingChecked) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[0] === 'onboarding';

    if (session) {
      if (!session.user.email_confirmed_at) {
        if (segments[1] !== 'verify-email') {
          router.replace('/(auth)/verify-email');
        }
      } else if (!onboardingDone && !onOnboarding) {
        router.replace('/onboarding');
      } else if (onboardingDone && (inAuthGroup || onOnboarding)) {
        router.replace('/(tabs)');
      }
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    }

    SplashScreen.hideAsync();
  }, [session, isLoading, segments, onboardingChecked, onboardingDone]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors[colorScheme ?? 'light'].background }}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].primary} />
      </View>
    );
  }

  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </AppThemeProvider>
  );
}
