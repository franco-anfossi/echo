import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/ctx/AuthContext';
import { ThemePreference, useThemePreference } from '@/ctx/ThemeContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { clearAllEchoCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const THEME_OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: 'light', label: 'Claro', icon: 'sunny-outline' },
  { id: 'dark', label: 'Oscuro', icon: 'moon-outline' },
  { id: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const { preference, setPreference } = useThemePreference();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleUpdateProfile() {
    if (!user) return;
    setLoading(true);
    setSaved(false);
    try {
      const trimmed = fullName.trim();
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: trimmed }
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('id', user.id);

      if (profileError) throw profileError;

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function exportData() {
    if (!user) return;
    setLoading(true);
    try {
      const [profileRes, attemptsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('attempts')
          .select('*, attempt_scores(*), attempt_metrics(*), attempt_feedback(transcript, feedback_points)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (attemptsRes.error) throw attemptsRes.error;

      const payload = {
        exportedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile: profileRes.data,
        attempts: attemptsRes.data,
      };
      const json = JSON.stringify(payload, null, 2);
      await Share.share({ message: json, title: 'Mis datos de Echo' });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudieron exportar los datos.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmSignOut() {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: signOut },
      ]
    );
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await clearAllEchoCache();
  }

  async function confirmDeleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      '¿Estás seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: deleteAccount }
      ]
    );
  }

  async function deleteAccount() {
    try {
      if (!user) return;
      const { error } = await supabase.from('profiles').delete().eq('id', user.id);
      if (error) throw error;
      await supabase.auth.signOut();
      await clearAllEchoCache();
      Alert.alert('Cuenta eliminada', 'Tu cuenta ha sido eliminada correctamente.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo eliminar la cuenta');
    }
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 16 }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: themeColors.inputBackground, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="settings" size={24} color={themeColors.primary} />
          </View>
          <Typography variant="h2" weight="bold">Configuración</Typography>
        </View>
      </View>
      <Typography variant="body" color={themeColors.subtext} style={{ marginTop: 8, marginBottom: 24, marginLeft: 4 }}>
        Administra tu cuenta y preferencias personalizadas.
      </Typography>

      <View style={styles.section}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>Perfil</Typography>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Typography variant="label" color={themeColors.subtext} style={{ marginBottom: 8 }}>NOMBRE COMPLETO</Typography>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            style={[styles.input, { backgroundColor: themeColors.inputBackground, color: themeColors.text }]}
            placeholder="Tu nombre"
            placeholderTextColor={themeColors.subtext}
          />

          <Typography variant="label" color={themeColors.subtext} style={{ marginBottom: 8, marginTop: 16 }}>EMAIL</Typography>
          <Typography variant="body" color={themeColors.subtext} style={{ marginBottom: 24 }}>{user?.email}</Typography>

          <Button
            title={loading ? "Guardando..." : saved ? "Guardado ✓" : "Actualizar Perfil"}
            onPress={handleUpdateProfile}
            disabled={loading}
            variant={saved ? 'secondary' : 'primary'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>Apariencia</Typography>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Typography variant="label" color={themeColors.subtext} style={{ marginBottom: 12 }}>TEMA</Typography>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {THEME_OPTIONS.map((opt) => {
              const active = preference === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setPreference(opt.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    backgroundColor: active ? themeColors.primary : themeColors.inputBackground,
                    borderColor: active ? themeColors.primary : themeColors.border,
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={active ? '#FFF' : themeColors.text}
                  />
                  <Typography variant="caption" weight="bold" color={active ? '#FFF' : themeColors.text}>
                    {opt.label}
                  </Typography>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>Cuenta</Typography>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, gap: 12 }]}>
          <Button
            title="Invitar amigo"
            variant="ghost"
            onPress={async () => {
              try {
                await Share.share({
                  message: '¿Quieres mejorar tu oratoria en español? Probé Echo y me está ayudando mucho. Dale una mirada 👉',
                });
              } catch (e) {
                console.error('Share invite failed', e);
              }
            }}
            textColor={themeColors.primary}
            icon={<Ionicons name="person-add-outline" size={20} color={themeColors.primary} />}
            style={{ justifyContent: 'flex-start' }}
          />
          <View style={{ height: 1, backgroundColor: themeColors.border }} />
          <Button
            title="Exportar mis datos"
            variant="ghost"
            onPress={exportData}
            disabled={loading}
            textColor={themeColors.primary}
            icon={<Ionicons name="download-outline" size={20} color={themeColors.primary} />}
            style={{ justifyContent: 'flex-start' }}
          />
          <View style={{ height: 1, backgroundColor: themeColors.border }} />
          <Button
            title="Borrar datos locales"
            variant="ghost"
            onPress={async () => {
              await clearAllEchoCache();
              Alert.alert('Listo', 'Caché local eliminada.');
            }}
            textColor={themeColors.text}
            icon={<Ionicons name="trash-bin-outline" size={20} color={themeColors.subtext} />}
            style={{ justifyContent: 'flex-start' }}
          />
          <View style={{ height: 1, backgroundColor: themeColors.border }} />
          <Button
            title="Cerrar Sesión"
            variant="ghost"
            onPress={confirmSignOut}
            textColor={themeColors.primary}
            icon={<Ionicons name="log-out-outline" size={20} color={themeColors.primary} />}
            style={{ justifyContent: 'flex-start' }}
          />
          <View style={{ height: 1, backgroundColor: themeColors.border }} />
          <Button
            title="Eliminar Cuenta"
            variant="ghost"
            onPress={confirmDeleteAccount}
            textColor={themeColors.error}
            icon={<Ionicons name="trash-outline" size={20} color={themeColors.error} />}
            style={{ justifyContent: 'flex-start' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Typography variant="h3" style={{ marginBottom: 16 }}>Acerca de</Typography>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, gap: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Typography variant="caption" color={themeColors.subtext}>Aplicación</Typography>
            <Typography variant="caption" weight="bold">
              {Constants.expoConfig?.name || 'Echo'}
            </Typography>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Typography variant="caption" color={themeColors.subtext}>Versión</Typography>
            <Typography variant="caption" weight="bold">
              {Constants.expoConfig?.version || '1.0.0'}
            </Typography>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Typography variant="caption" color={themeColors.subtext}>Plataforma</Typography>
            <Typography variant="caption" weight="bold">
              Expo {Constants.expoConfig?.sdkVersion || ''}
            </Typography>
          </View>
        </View>
      </View>

      <View style={{ marginBottom: 20, alignItems: 'center' }}>
        <Typography variant="caption" color={themeColors.subtext}>
          Hecho para practicar español · con ❤️
        </Typography>
      </View>

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 32,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center', // Align back button and title
  },
  section: {
    marginBottom: 32,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
  }
});
