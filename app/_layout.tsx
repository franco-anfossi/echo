
import { Colors } from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (session) {
      if (!session.user.email_confirmed_at) {
        // Redirect to verify email if not confirmed
        // Allow access to verify-email screen only within auth group
        if (segments[1] !== 'verify-email') {
          router.replace('/(auth)/verify-email');
        }
      } else if (inAuthGroup) {
        // User is signed in and verified, redirect to home
        router.replace('/(tabs)');
      }
    } else if (!session && !inAuthGroup) {
      // User is not signed in, redirect to login
      router.replace('/(auth)/login');
    }

    SplashScreen.hideAsync();
  }, [session, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors[colorScheme ?? 'light'].background }}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
