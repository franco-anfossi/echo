
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      Alert.alert(Strings.common.error, error.message);
    } else {
      // Typically need to check email confirmation setting
      // For now, assuming auto-confirm or user manually confirms
      Alert.alert('Éxito', 'Verifica tu correo electrónico para confirmar tu cuenta.');
    }
    setLoading(false);
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Typography variant="h2" align="center" style={styles.title}>
          {Strings.auth.signupTitle}
        </Typography>
        <Typography variant="body" align="center" color={Colors[colorScheme].subtext}>
          {Strings.auth.signupSubtitle}
        </Typography>
      </View>

      <View style={styles.form}>
        <Input
          label="Nombre completo"
          value={fullName}
          onChangeText={setFullName}
        />
        <Input
          label={Strings.auth.emailLabel}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label={Strings.auth.passwordLabel}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Button
          title={Strings.auth.signupButton}
          onPress={signUpWithEmail}
          loading={loading}
          style={styles.button}
        />

        <View style={styles.footer}>
          <Typography variant="caption" color={Colors[colorScheme].subtext}>
            {Strings.auth.haveAccount}{' '}
          </Typography>
          <Link href="/(auth)/login" asChild>
            <Typography variant="caption" weight="bold" color={Colors[colorScheme].primary}>
              {Strings.auth.signInLink}
            </Typography>
          </Link>
        </View>
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
    marginBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
