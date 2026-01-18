
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function VerifyEmail() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';

  async function resendEmail() {
    if (!user?.email) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Correo enviado', 'Por favor revisa tu bandeja de entrada.');
    }
    setLoading(false);
  }

  async function CheckVerification() {
    const { data: { user: updatedUser } } = await supabase.auth.getUser();
    if (updatedUser?.email_confirmed_at) {
      // AuthContext will update automatically due to onAuthStateChange usually, 
      // but explicit reload helps if user clicked link in email app and came back.
      // Actually, onAuthStateChange triggers on TOKEN_REFRESHED. 
      // We might need to manually refresh session.
      await supabase.auth.refreshSession();
    } else {
      Alert.alert('Aún no verificado', 'Si ya confirmaste, intenta recargar.');
    }
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Typography variant="h2" align="center" style={styles.title}>
          Verifica tu correo
        </Typography>
        <Typography variant="body" align="center" color={Colors[colorScheme].subtext}>
          Hemos enviado un enlace de confirmación a:
        </Typography>
        <Typography variant="body" weight="bold" align="center" style={{ marginTop: 8 }}>
          {user?.email}
        </Typography>
      </View>

      <Typography variant="caption" align="center" color={Colors[colorScheme].subtext} style={styles.info}>
        No podrás acceder a la aplicación hasta que verifiques tu cuenta.
      </Typography>

      <View style={styles.actions}>
        <Button
          title="Ya verifiqué mi cuenta"
          onPress={CheckVerification}
          variant="primary"
          style={styles.button}
        />

        <Button
          title="Reenviar correo"
          onPress={resendEmail}
          loading={loading}
          variant="secondary"
          style={styles.button}
        />

        <Button
          title="Cerrar sesión"
          onPress={() => supabase.auth.signOut()}
          variant="ghost"
          style={styles.button}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    marginBottom: 16,
  },
  info: {
    marginBottom: 32,
  },
  actions: {
    width: '100%',
  },
  button: {
    marginBottom: 16,
  },
});
