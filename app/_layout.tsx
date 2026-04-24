
import { Colors } from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/ctx/AuthContext';
import { ThemeProvider as AppThemeProvider } from '@/ctx/ThemeContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabaseConfigured } from '@/lib/supabase';
import { ONBOARDING_KEY } from '@/app/onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function MissingConfigScreen() {
  return (
    <View style={missingStyles.container}>
      <Ionicons name="construct-outline" size={56} color="#3B82F6" />
      <Text style={missingStyles.title}>Configuración requerida</Text>
      <Text style={missingStyles.body}>
        Falta configurar las credenciales de Supabase. Define{' '}
        <Text style={missingStyles.code}>EXPO_PUBLIC_SUPABASE_URL</Text> y{' '}
        <Text style={missingStyles.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> en{' '}
        <Text style={missingStyles.code}>.env</Text> y reinicia la app.
      </Text>
    </View>
  );
}

const missingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFF',
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#475569',
  },
  code: {
    fontFamily: 'Courier',
    color: '#0F172A',
  },
});

export default function RootLayout() {
  if (!supabaseConfigured) {
    SplashScreen.hideAsync();
    return <MissingConfigScreen />;
  }
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </AppThemeProvider>
  );
}
