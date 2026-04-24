
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { validateEmail, validateFullName, validatePassword } from '@/lib/validation';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';

  async function signUpWithEmail() {
    const nErr = validateFullName(fullName);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setNameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (nErr || eErr || pErr) return;

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      Alert.alert(Strings.common.error, error.message);
    } else {
      Alert.alert('Éxito', 'Verifica tu correo electrónico para confirmar tu cuenta.');
    }
    setLoading(false);
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.container} keyboardAvoiding>
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
          onChangeText={(v) => { setFullName(v); if (nameError) setNameError(null); }}
          autoComplete="name"
          error={nameError}
        />
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
          autoComplete="password-new"
          secureTextEntry
          error={passwordError}
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
