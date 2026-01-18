
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';

  useEffect(() => {
    // Handle deep link if the user arrived here directly
    const handleUrl = async (url: string) => {
      // Inline parsing of hash/params from Supabase deep link
      const parsed = Linking.parse(url);
      const params = (parsed.queryParams as any) || {};

      // Supabase sends recovery links with hash fragments, 
      // but expo-linking might put them in queryParams or we might need to parse fragment.
      let accessToken = params.access_token;
      let refreshToken = params.refresh_token;

      if (!accessToken && url.includes('#')) {
        const hash = url.split('#')[1];
        const hashParams = new URLSearchParams(hash);
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');
      }

      const finalAccessToken = Array.isArray(accessToken) ? accessToken[0] : accessToken;
      const finalRefreshToken = Array.isArray(refreshToken) ? refreshToken[0] : refreshToken;

      if (finalAccessToken && finalRefreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });
        if (error) {
          Alert.alert('Error', 'El enlace es inválido o ha expirado.');
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
  }, []);

  async function updatePassword() {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Éxito',
        'Tu contraseña ha sido actualizada.',
        [{ text: 'Ir al Inicio', onPress: () => router.replace('/(tabs)') }]
      );
    }
    setLoading(false);
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Typography variant="h2" align="center" style={styles.title}>
          Nueva Contraseña
        </Typography>
        <Typography variant="body" align="center" color={Colors[colorScheme].subtext}>
          Introduce tu nueva contraseña.
        </Typography>
      </View>

      <View style={styles.form}>
        <Input
          label="Nueva contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Button
          title="Actualizar contraseña"
          onPress={updatePassword}
          loading={loading}
          style={styles.button}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    marginBottom: 8,
  },
  form: {
    width: '100%',
  },
  button: {
    marginTop: 16,
  },
});
