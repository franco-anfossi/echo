import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { formatDuration } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function SessionScreen() {
  const params = useLocalSearchParams();
  const { topicId, topicTitle, mode = 'improv', targetText, words, stance } = params as any;

  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'review' | 'uploading'>('idle');

  // Duration Logic
  const getMaxDuration = () => {
    if (mode === 'reading') return 180;
    if (mode === 'debate') return 60; // 1 min debate
    if (mode === 'vocab') return 60;
    if (mode === 'interview') return 90;
    return 90; // Improv default
  };

  const MAX_DURATION = getMaxDuration();
  const [timeLeft, setTimeLeft] = useState(MAX_DURATION);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(16).fill(0.1));

  useEffect(() => {
    let interval: any;
    if (recordingStatus === 'recording') {
      interval = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else if (recordingStatus === 'idle') {
      setTimeLeft(MAX_DURATION);
    }
    return () => clearInterval(interval);
  }, [recordingStatus]);

  // Auto-stop
  useEffect(() => {
    if (timeLeft === 0 && recordingStatus === 'recording') {
      stopRecording();
    }
  }, [timeLeft, recordingStatus]);

  // Light haptic warning at the 10s and 5s marks while recording
  useEffect(() => {
    if (recordingStatus !== 'recording') return;
    if (timeLeft === 10 || timeLeft === 5) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [timeLeft, recordingStatus]);

  // Block accidental leaves while recording / uploading
  const navigation = useNavigation();
  useEffect(() => {
    const isBusy = recordingStatus === 'recording' || recordingStatus === 'uploading';
    if (!isBusy) return;

    const beforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      Alert.alert(
        recordingStatus === 'recording' ? 'Salir de la grabación' : 'Subida en progreso',
        recordingStatus === 'recording'
          ? 'Si sales ahora perderás la grabación. ¿Continuar?'
          : 'Tu grabación se está subiendo. Si sales podría no procesarse. ¿Continuar?',
        [
          { text: 'Quedarme', style: 'cancel' },
          {
            text: 'Salir',
            style: 'destructive',
            onPress: async () => {
              if (recording) {
                try { await recording.stopAndUnloadAsync(); } catch {}
              }
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      beforeRemove();
      backHandler.remove();
    };
  }, [recordingStatus, navigation, recording]);

  async function startRecording() {
    try {
      if (permissionResponse?.status !== 'granted') {
        const result = await requestPermission();
        if (result.status !== 'granted') {
          if (!result.canAskAgain) {
            Alert.alert(
              'Permiso de micrófono',
              'Habilítalo en los ajustes del sistema para poder grabar.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
              ]
            );
          }
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (!status.isRecording) return;
          // metering is in dBFS (typically -160..0). Map to 0..1.
          const db = typeof status.metering === 'number' ? status.metering : -160;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setLevels((prev) => {
            const next = prev.slice(1);
            next.push(0.1 + normalized * 0.9);
            return next;
          });
        },
        100
      );

      setRecording(recording);
      setRecordingStatus('recording');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setRecordingStatus('review');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  const formatTime = formatDuration;

  async function uploadRecording() {
    if (!audioUri || !user) return;
    setRecordingStatus('uploading');

    try {
      const arrayBuffer = await fetch(audioUri).then(r => r.arrayBuffer());
      const fileName = `${user.id}/${Date.now()}.m4a`;

      // 1. Upload
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, arrayBuffer, { contentType: 'audio/m4a', upsert: false });

      if (uploadError) throw uploadError;

      // Prepare targetText for Context
      let finalTargetText = targetText;
      if (mode === 'vocab' && words) {
        finalTargetText = `Context: ${targetText}. Include words: ${words}`;
      } else if (mode === 'debate' && stance) {
        finalTargetText = `Topic: ${targetText}. Stance: ${stance}`;
      }

      // Only attach a topic_id when it looks like a real DB id (custom topics have ids like "custom-...")
      const validTopicId = mode === 'improv' && topicId && !String(topicId).startsWith('custom-')
        ? topicId
        : null;

      // 2. Create Attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from('attempts')
        .insert({
          user_id: user.id,
          topic_id: validTopicId,
          audio_path: fileName,
          duration_seconds: MAX_DURATION - timeLeft,
          status: 'uploaded',
          practice_type: mode,
          target_text: finalTargetText,
        })
        .select()
        .single();

      if (attemptError) throw attemptError;

      // 3. Process
      supabase.functions.invoke('transcribe-audio', {
        body: { attemptId: attemptData.id }
      });

      Alert.alert('Éxito', 'Grabación subida. Procesando resultados...');
      router.replace({
        pathname: '/(tabs)/practice/results',
        params: { attemptId: attemptData.id }
      });

    } catch (error) {
      console.error(error);
      Alert.alert(
        'Error al subir',
        'No se pudo subir la grabación. Verifica tu conexión e intenta nuevamente.',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setRecordingStatus('review') },
          { text: 'Reintentar', onPress: () => uploadRecording() },
        ]
      );
      setRecordingStatus('review');
    }
  }

  const renderContent = () => {
    switch (mode) {
      case 'reading':
        return (
          <ScrollView contentContainerStyle={{ padding: 24 }} style={[styles.cardContainer, { backgroundColor: themeColors.surface }]}>
            <Typography variant="h3" style={{ lineHeight: 32, color: themeColors.text }}>{targetText}</Typography>
          </ScrollView>
        );
      case 'interview':
        return (
          <View style={[styles.cardContainer, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
            <Typography variant="label" color={themeColors.subtext} style={{ marginBottom: 16 }}>ENTREVISTADOR</Typography>
            <Typography variant="h2" align="center" weight="bold">«{targetText}»</Typography>
            <View style={{ marginTop: 32 }}>
              <Ionicons name="people-circle-outline" size={64} color={themeColors.subtext} />
            </View>
          </View>
        );
      case 'debate':
        const stanceColor = stance === 'FOR' ? themeColors.success : themeColors.error;
        const stanceLabel = stance === 'FOR' ? 'A FAVOR' : 'EN CONTRA';
        return (
          <View style={[styles.cardContainer, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
            <Typography variant="h3" align="center" style={{ marginBottom: 24 }}>{targetText}</Typography>
            <View style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, backgroundColor: stanceColor + '20', borderWidth: 2, borderColor: stanceColor }}>
              <Typography variant="h1" weight="black" color={stanceColor}>{stanceLabel}</Typography>
            </View>
            <Typography variant="body" align="center" color={themeColors.subtext} style={{ marginTop: 24 }}>
              Argumenta {stanceLabel.toLowerCase()} de esta premisa por {formatTime(MAX_DURATION)}.
            </Typography>
          </View>
        );
      case 'vocab':
        const wordList = words ? JSON.parse(words) : [];
        return (
          <View style={[styles.cardContainer, { backgroundColor: themeColors.surface, padding: 24 }]}>
            <Typography variant="label" align="center" color={themeColors.subtext} style={{ marginBottom: 16 }}>INCLUYE ESTAS PALABRAS</Typography>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {wordList.map((w: string, i: number) => (
                <View key={i} style={{ backgroundColor: themeColors.secondary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: themeColors.primary }}>
                  <Typography variant="h3" weight="bold" color={themeColors.primary}>{w}</Typography>
                </View>
              ))}
            </View>
            <Typography variant="body" align="center" color={themeColors.text} style={{ marginTop: 32 }}>
              «{targetText}»
            </Typography>
          </View>
        );
      default: // Improv
        return (
          <View style={[styles.vizContainer, { backgroundColor: themeColors.background }]}>
            <View style={{ height: 80, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {levels.map((lvl, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: Math.max(6, lvl * 70),
                    backgroundColor: recordingStatus === 'recording' ? themeColors.primary : themeColors.border,
                    borderRadius: 3,
                  }}
                />
              ))}
            </View>
            <Typography variant="body" color={themeColors.subtext} style={{ marginTop: 20 }}>
              Habla sobre el tema durante el tiempo asignado.
            </Typography>
          </View>
        );
    }
  };

  if (permissionResponse?.status === 'denied' && !permissionResponse.canAskAgain) {
    return (
      <ScreenWrapper>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: themeColors.inputBackground, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="mic-off" size={40} color={themeColors.error} />
          </View>
          <Typography variant="h2" weight="bold" align="center" style={{ marginTop: 24 }}>
            Permiso de micrófono requerido
          </Typography>
          <Typography variant="body" color={themeColors.subtext} align="center" style={{ marginTop: 8, lineHeight: 22 }}>
            Echo necesita acceso al micrófono para grabar tu práctica. Habilítalo en los ajustes del sistema.
          </Typography>
          <Button
            title="Abrir ajustes"
            onPress={() => Linking.openSettings()}
            style={{ marginTop: 24, width: '100%' }}
          />
          <Button
            title="Volver"
            variant="ghost"
            onPress={() => router.back()}
            style={{ marginTop: 8, width: '100%' }}
          />
        </View>
      </ScreenWrapper>
    );
  }

  const progressPct = Math.max(0, Math.min(100, ((MAX_DURATION - timeLeft) / MAX_DURATION) * 100));

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {recordingStatus === 'recording' && (
          <View style={{ height: 3, backgroundColor: themeColors.inputBackground, borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <View style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: timeLeft <= 10 ? themeColors.error : themeColors.primary,
              borderRadius: 2,
            }} />
          </View>
        )}
        <View style={styles.header}>
          <View style={[
            styles.timerBubbleSmall,
            {
              backgroundColor: themeColors.surface,
              borderWidth: timeLeft <= 10 && recordingStatus === 'recording' ? 1 : 0,
              borderColor: timeLeft <= 10 && recordingStatus === 'recording' ? themeColors.error : 'transparent',
            }
          ]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: recordingStatus === 'recording' ? themeColors.error : themeColors.subtext, marginRight: 8 }} />
            <Typography
              variant="label"
              monospace
              weight="bold"
              color={timeLeft <= 10 && recordingStatus === 'recording' ? themeColors.error : undefined}
            >
              {formatTime(timeLeft)}
            </Typography>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            accessibilityLabel="Cerrar sesión de práctica"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.topicContainer}>
          <Typography variant="label" color={themeColors.primary} align="center">
            {mode.toUpperCase()}
          </Typography>
          <Typography variant="h3" align="center" style={{ marginTop: 8 }}>
            {topicTitle}
          </Typography>
        </View>

        {renderContent()}

        <View style={styles.controls}>
          {recordingStatus === 'idle' && (
            <Button
              title="Comenzar Grabación"
              onPress={startRecording}
              style={{ width: '100%' }}
              icon={<Ionicons name="mic" size={24} color="#fff" />}
            />
          )}

          {recordingStatus === 'recording' && (
            <TouchableOpacity
              style={[styles.stopButton, { borderColor: themeColors.error }]}
              onPress={stopRecording}
            >
              <View style={{ width: 24, height: 24, backgroundColor: themeColors.error, borderRadius: 4 }} />
            </TouchableOpacity>
          )}

          {recordingStatus === 'review' && (
            <View style={{ width: '100%', gap: 16 }}>
              <Button
                title="Enviar Evaluación"
                onPress={uploadRecording}
              />
              <Button
                title="Reintentar"
                variant="outline"
                onPress={() => {
                  Alert.alert(
                    'Reintentar',
                    'Se descartará la grabación actual. ¿Continuar?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Reintentar',
                        style: 'destructive',
                        onPress: () => {
                          setRecordingStatus('idle');
                          setAudioUri(null);
                        },
                      },
                    ]
                  );
                }}
              />
            </View>
          )}

          {recordingStatus === 'uploading' && (
            <View style={{ alignItems: 'center', gap: 16 }}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Typography variant="body" color={themeColors.subtext}>Subiendo y procesando...</Typography>
            </View>
          )}
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  timerBubbleSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  vizContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 24,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)'
  },
  controls: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    minHeight: 120,
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
