import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { validateEmail, validatePassword } from '@/lib/validation';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';

  async function signInWithEmail() {
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      Alert.alert(Strings.common.error, error.message);
    }
    setLoading(false);
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container} keyboardAvoiding>
      <View style={styles.header}>
        <Typography variant="h1" align="center" style={styles.title}>
          Echo One
        </Typography>
        <Typography variant="body" align="center" color={Colors[colorScheme].subtext}>
          {Strings.auth.loginSubtitle}
        </Typography>
      </View>

      <View style={styles.form}>
        <Input
          label={Strings.auth.emailLabel}
          value={email}
          onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(null); }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          error={emailError}
        />
        <Input
          label={Strings.auth.passwordLabel}
          value={password}
          onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(null); }}
          autoComplete="password"
          secureTextEntry
          error={passwordError}
        />

        <View style={{ alignItems: 'flex-end', marginBottom: 24 }}>
          <Link href="/(auth)/forgot-password" asChild>
            <Typography variant="caption" color={Colors[colorScheme].primary}>
              ¿Olvidaste tu contraseña?
            </Typography>
          </Link>
        </View>

        <Button
          title={Strings.auth.loginButton}
          onPress={signInWithEmail}
          loading={loading}
          style={styles.button}
        />

        <View style={styles.footer}>
          <Typography variant="caption" color={Colors[colorScheme].subtext}>
            {Strings.auth.noAccount}{' '}
          </Typography>
          <Link href="/(auth)/signup" asChild>
            <Typography variant="caption" weight="bold" color={Colors[colorScheme].primary}>
              {Strings.auth.signUpLink}
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
