
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';

  async function requestReset() {
    if (!email) {
      Alert.alert('Error', 'Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    // redirectTo should point to the deep link for reset-password
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'echo://auth/reset-password',
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada para restablecer tu contraseña.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
    setLoading(false);
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Typography variant="h2" align="center" style={styles.title}>
          Recuperar contraseña
        </Typography>
        <Typography variant="body" align="center" color={Colors[colorScheme].subtext}>
          Ingresa tu correo para recibir las instrucciones.
        </Typography>
      </View>

      <View style={styles.form}>
        <Input
          label={Strings.auth.emailLabel}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Button
          title="Enviar instrucciones"
          onPress={requestReset}
          loading={loading}
          style={styles.button}
        />

        <Button
          title={Strings.common.cancel}
          variant="ghost"
          onPress={() => router.back()}
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
