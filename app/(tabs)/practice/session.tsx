import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

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
  const [metering, setMetering] = useState<number>(-160);

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

  async function startRecording() {
    try {
      if (permissionResponse?.status !== 'granted') {
        const { status } = await requestPermission();
        if (status !== 'granted') return Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => setMetering(status.metering || -160)
      );

      setRecording(recording);
      setRecordingStatus('recording');
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setRecordingStatus('review');
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  async function uploadRecording() {
    if (!audioUri || !user) return;
    setRecordingStatus('uploading');

    try {
      const arrayBuffer = await fetch(audioUri).then(r => r.arrayBuffer());
      const fileName = `${user.id}/${Date.now()}.m4a`;

      // 1. Upload
      const { data: uploadData, error: uploadError } = await supabase.storage
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

      // 2. Create Attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from('attempts')
        .insert({
          user_id: user.id,
          topic_id: mode === 'improv' ? topicId : null,
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
      Alert.alert('Error', 'No se pudo subir la grabación.');
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
            <Typography variant="h2" align="center" weight="bold">"{targetText}"</Typography>
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
              "{targetText}"
            </Typography>
          </View>
        );
      default: // Improv
        return (
          <View style={[styles.vizContainer, { backgroundColor: themeColors.background }]}>
            <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {[...Array(5)].map((_, i) => (
                <View key={i} style={{ width: 8, height: recordingStatus === 'recording' ? 30 + Math.random() * 30 : 10, backgroundColor: themeColors.primary, borderRadius: 4 }} />
              ))}
            </View>
            <Typography variant="body" color={themeColors.subtext} style={{ marginTop: 20 }}>
              Habla sobre el tema durante el tiempo asignado.
            </Typography>
          </View>
        );
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.timerBubbleSmall, { backgroundColor: themeColors.surface }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: recordingStatus === 'recording' ? themeColors.error : themeColors.subtext, marginRight: 8 }} />
            <Typography variant="label" monospace weight="bold">
              {formatTime(timeLeft)}
            </Typography>
          </View>

          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
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
                  setRecordingStatus('idle');
                  setAudioUri(null);
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
