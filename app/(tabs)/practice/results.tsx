import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Achievement, computeAchievements } from '@/lib/achievements';
import { readCache, writeCache } from '@/lib/cache';
import { formatDuration } from '@/lib/format';
import { modeLabel } from '@/lib/practice-modes';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';

// Helper component for animating numbers naturally
const AnimatedScore = ({ score, color }: { score: number, color: string }) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1);
      // Easing function: easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);

      const current = Math.floor(ease * score);
      setDisplayScore(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score]);

  return (
    <Typography variant="h1" style={{ fontSize: 64, lineHeight: 72, color }}>
      {displayScore}
    </Typography>
  );
};

export default function ResultsScreen() {
  const { attemptId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<any>(null);
  const [scores, setScores] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [isPersonalBest, setIsPersonalBest] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const retryCount = useRef(0);
  const lastRetryTime = useRef(0);
  const isRequestInProgress = useRef(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  useEffect(() => {
    if (!attemptId) return;

    let polling = true;
    const pollInterval = setInterval(async () => {
      if (!polling) return;
      await fetchResults();
    }, 2000);

    return () => {
      polling = false;
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const fetchResults = async () => {
    try {
      const { data: attemptData, error } = await supabase
        .from('attempts')
        .select('*')
        .eq('id', attemptId)
        .single();

      if (error) throw error;
      setAttempt(attemptData);

      if (attemptData.status === 'completed') {
        const [scoresRes, metricsRes, feedbackRes] = await Promise.all([
          supabase.from('attempt_scores').select('*').eq('attempt_id', attemptId).single(),
          supabase.from('attempt_metrics').select('*').eq('attempt_id', attemptId).single(),
          supabase.from('attempt_feedback').select('*').eq('attempt_id', attemptId).single()
        ]);

        if (scoresRes.data) setScores(scoresRes.data);
        if (metricsRes.data) setMetrics(metricsRes.data);
        if (feedbackRes.data) setFeedback(feedbackRes.data);

        // Detect achievements unlocked by this attempt
        if (user?.id && scoresRes.data) {
          try {
            const [profile, bestRow, attemptsForModes] = await Promise.all([
              supabase.from('profiles').select('streak_current, streak_longest, total_attempts, xp').eq('id', user.id).single(),
              supabase
                .from('attempt_scores')
                .select('overall_score, attempts!inner(user_id)')
                .eq('attempts.user_id', user.id)
                .order('overall_score', { ascending: false })
                .limit(1)
                .maybeSingle(),
              supabase.from('attempts').select('practice_type').eq('user_id', user.id),
            ]);
            const since = new Date();
            since.setDate(since.getDate() - 30);
            const monthlyScoresRes = await supabase
              .from('attempt_scores')
              .select('overall_score, attempts!inner(user_id, created_at)')
              .eq('attempts.user_id', user.id)
              .gte('attempts.created_at', since.toISOString());
            const monthScores = (monthlyScoresRes.data || [])
              .map((r: any) => r.overall_score)
              .filter((s: number) => s > 0);
            const monthlyAvg = monthScores.length > 0
              ? Math.round(monthScores.reduce((a: number, b: number) => a + b, 0) / monthScores.length)
              : 0;

            const uniqueModes = new Set(
              (attemptsForModes.data || []).map((r: any) => r.practice_type).filter(Boolean)
            ).size;

            const all = computeAchievements({
              total_attempts: profile.data?.total_attempts || 0,
              streak_current: profile.data?.streak_current || 0,
              streak_longest: profile.data?.streak_longest || 0,
              xp: profile.data?.xp || 0,
              best_overall_score: (bestRow.data as any)?.overall_score || 0,
              monthly_avg_score: monthlyAvg,
              unique_modes_used: uniqueModes,
            });
            const seenKey = `echo:achievements-seen:${user.id}`;
            const seen = (await readCache<string[]>(seenKey)) || [];
            const seenSet = new Set(seen);
            const fresh = all.filter((a) => a.unlocked && !seenSet.has(a.id));
            if (fresh.length > 0) {
              setNewlyUnlocked(fresh);
            }
            const allUnlockedIds = all.filter((a) => a.unlocked).map((a) => a.id);
            writeCache(seenKey, Array.from(new Set([...seen, ...allUnlockedIds])));
          } catch (achErr) {
            console.error('Achievements check failed', achErr);
          }
        }

        // Personal best detection: highest score for this user+mode, excluding the current attempt
        if (scoresRes.data?.overall_score && user?.id && attemptData.practice_type) {
          try {
            const { data: prevBestRows } = await supabase
              .from('attempt_scores')
              .select('overall_score, attempts!inner(user_id, practice_type, id)')
              .eq('attempts.user_id', user.id)
              .eq('attempts.practice_type', attemptData.practice_type)
              .neq('attempt_id', attemptId)
              .order('overall_score', { ascending: false })
              .limit(1);
            const prevBest = (prevBestRows && prevBestRows[0])
              ? (prevBestRows[0] as any).overall_score
              : 0;
            if (scoresRes.data.overall_score > prevBest) {
              setIsPersonalBest(true);
            }
          } catch (pbErr) {
            console.error('PB lookup failed', pbErr);
          }
        }

        setLoading(false);
      } else if (attemptData.status === 'failed') {
        // If failed, try again if under limit and cooldown passed
        if (shouldRetry()) {
          triggerAnalysisRetry();
        } else if (retryCount.current >= 3) {
          setLoading(false); // Give up
        }
      } else if ((attemptData.status === 'uploaded' || attemptData.status === 'created' || attemptData.status === 'processing')) {
        // Trigger retry if stuck AND cooldown passed
        if (shouldRetry()) {
          triggerAnalysisRetry();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const shouldRetry = () => {
    const now = Date.now();
    return retryCount.current < 3 && !isRequestInProgress.current && (now - lastRetryTime.current > 15000);
  };

  const triggerAnalysisRetry = async () => {
    isRequestInProgress.current = true;
    lastRetryTime.current = Date.now();
    retryCount.current += 1;
    try {
      const { error } = await supabase.functions.invoke('transcribe-audio', {
        body: { attemptId }
      });
      if (error) throw error;
    } catch (e) {
      console.error('Retry failed:', e);
    } finally {
      isRequestInProgress.current = false;
    }
  };

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const togglePlayback = async () => {
    if (!attempt?.audio_path) return;
    try {
      if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
        return;
      }
      setAudioLoading(true);
      const { data, error } = await supabase.storage
        .from('recordings')
        .createSignedUrl(attempt.audio_path, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error('No signed URL');

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.signedUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          sound.setPositionAsync(0).catch(() => {});
        }
      });
    } catch (e) {
      console.error('Playback failed', e);
      Alert.alert('Audio', 'No se pudo reproducir el audio.');
    } finally {
      setAudioLoading(false);
    }
  };

  const handleShare = async () => {
    if (!scores) return;
    const lines = [
      `🎙️ Echo · Práctica de oratoria`,
      ``,
      `Modo: ${modeLabel(attempt?.practice_type)}`,
      `Puntuación global: ${scores.overall_score ?? 0}/100`,
      ``,
      `· Fluidez: ${scores.fluency_score ?? 0}`,
      `· Vocabulario: ${scores.vocabulary_score ?? 0}`,
      `· Gramática: ${scores.grammar_score ?? 0}`,
      `· Coherencia: ${scores.coherence_score ?? 0}`,
    ];
    if (metrics?.wpm) lines.push(`· Velocidad: ${metrics.wpm} ppm`);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Eliminar Intento',
      '¿Estás seguro de que quieres eliminar este intento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (attempt?.audio_path) {
                await supabase.storage.from('recordings').remove([attempt.audio_path]);
              }
              await supabase.from('attempts').delete().eq('id', attemptId);
              router.replace('/(tabs)/history' as any);
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'No se pudo eliminar el intento.');
            }
          }
        }
      ]
    );
  };

  if (loading || (attempt?.status !== 'completed' && attempt?.status !== 'failed')) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Typography variant="h3" style={{ marginTop: 24 }}>Analizando Resultados</Typography>
          <Typography variant="body" color={themeColors.subtext} style={{ marginTop: 8, textAlign: 'center' }}>
            Nuestra IA está evaluando tu oratoria...
          </Typography>
        </View>
      </ScreenWrapper>
    );
  }

  if (attempt?.status === 'failed') {
    const handleManualRetry = async () => {
      retryCount.current = 0;
      lastRetryTime.current = 0;
      setLoading(true);
      try {
        await supabase.from('attempts').update({ status: 'uploaded' }).eq('id', attemptId);
        await supabase.functions.invoke('transcribe-audio', { body: { attemptId } });
      } catch (e) {
        console.error('Manual retry failed', e);
        Alert.alert('Error', 'No se pudo reintentar el análisis.');
        setLoading(false);
      }
    };
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={64} color={themeColors.error} />
          <Typography variant="h3" style={{ marginTop: 20 }}>Error en el análisis</Typography>
          <Typography variant="caption" color={themeColors.subtext} align="center" style={{ marginTop: 8 }}>
            Algo salió mal procesando tu grabación.
          </Typography>
          <Button title="Reintentar análisis" onPress={handleManualRetry} style={{ marginTop: 20, width: '100%' }} />
          <Button
            title="Volver"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/practice')}
            style={{ marginTop: 8, width: '100%' }}
          />
        </View>
      </ScreenWrapper>
    );
  }

  const feedbackPoints = feedback?.feedback_points?.feedback || feedback?.feedback_points || [];

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Top Actions */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.header}>
          <TouchableOpacity
            onPress={handleShare}
            style={[styles.closeButton, { marginRight: 8 }]}
            accessibilityLabel="Compartir resultado"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={22} color={themeColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            style={styles.closeButton}
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </Animated.View>

        {/* Global Score Results */}
        <Animated.View
          entering={ZoomIn.delay(300).duration(500)}
          style={[styles.mainScoreCard, { backgroundColor: themeColors.surface }]}
        >
          <View style={styles.scoreCircleBackground} />
          {isPersonalBest && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#FACC1522',
              borderColor: '#F59E0B',
              borderWidth: 1,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              marginBottom: 8,
            }}>
              <Ionicons name="trophy" size={14} color="#B45309" />
              <Typography variant="caption" weight="black" color="#B45309" style={{ letterSpacing: 0.5 }}>
                ¡RÉCORD PERSONAL!
              </Typography>
            </View>
          )}
          {(() => {
            const s = scores?.overall_score || 0;
            let msg = 'Buen comienzo';
            let color = themeColors.primary;
            if (s >= 90) { msg = '¡Excepcional!'; color = '#16A34A'; }
            else if (s >= 75) { msg = 'Muy bien hecho'; color = '#10B981'; }
            else if (s >= 60) { msg = 'Vas por buen camino'; color = '#0EA5E9'; }
            else if (s >= 40) { msg = 'Sigue practicando'; color = '#F59E0B'; }
            else if (s > 0) { msg = 'Cada práctica suma'; color = '#EF4444'; }
            return (
              <Typography variant="h3" weight="bold" color={color} style={{ marginBottom: 4 }}>
                {msg}
              </Typography>
            );
          })()}
          <Typography variant="label" color={themeColors.subtext} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            PUNTUACIÓN GLOBAL
          </Typography>
          <View style={styles.scoreRow}>
            <AnimatedScore score={scores?.overall_score || 0} color={themeColors.primary} />
            <Typography variant="h3" color={themeColors.subtext} style={{ marginBottom: 6 }}>/100</Typography>
          </View>

          {attempt?.audio_path && (
            <TouchableOpacity
              onPress={togglePlayback}
              disabled={audioLoading}
              style={{
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: themeColors.inputBackground,
              }}
            >
              {audioLoading ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause-circle' : 'play-circle'}
                  size={22}
                  color={themeColors.primary}
                />
              )}
              <Typography variant="label" weight="bold" color={themeColors.primary}>
                {isPlaying ? 'Pausar grabación' : 'Escuchar grabación'}
              </Typography>
            </TouchableOpacity>
          )}
        </Animated.View>

        {newlyUnlocked.length > 0 && (
          <Animated.View entering={FadeInDown.delay(450).duration(600)} style={[styles.unlocksCard, { backgroundColor: '#FACC1515', borderColor: '#F59E0B' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Ionicons name="trophy" size={20} color="#B45309" />
              <Typography variant="label" weight="black" color="#B45309" style={{ letterSpacing: 0.5 }}>
                LOGRO{newlyUnlocked.length === 1 ? '' : 'S'} DESBLOQUEADO{newlyUnlocked.length === 1 ? '' : 'S'}
              </Typography>
            </View>
            {newlyUnlocked.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <Ionicons name={a.icon as any} size={18} color={a.color} />
                <View style={{ flex: 1 }}>
                  <Typography variant="body" weight="bold">{a.title}</Typography>
                  <Typography variant="caption" color={themeColors.subtext}>{a.description}</Typography>
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        <Typography variant="h3" style={{ marginBottom: 12 }}>Métricas Técnicas</Typography>

        {/* Row 1: System Scores (3 Columns) */}
        <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.threeColumnGrid}>
          <MetricCard
            label="Velocidad"
            value={scores?.wpm_score}
            subValue={`${metrics?.wpm || 0} wpm`}
            icon="speedometer-outline"
            theme={themeColors}
            delay={500}
            small
          />
          <MetricCard
            label="Muletillas"
            value={scores?.filler_score}
            subValue={`${metrics?.filler_word_count || 0}`}
            icon="mic-off-outline"
            theme={themeColors}
            delay={550}
            small
          />
          <MetricCard
            label="Pausas"
            value={scores?.pause_score}
            subValue={`${metrics?.pause_count || 0}`}
            icon="pause-circle-outline"
            theme={themeColors}
            delay={600}
            small
          />
        </Animated.View>

        <Typography variant="h3" style={{ marginTop: 24, marginBottom: 12 }}>Evaluación IA</Typography>

        {/* Row 2+: AI Scores (2x2 Grid) */}
        <Animated.View entering={FadeInDown.delay(650).duration(600)} style={styles.grid}>
          <MetricCard
            label="Fluidez"
            value={scores?.fluency_score}
            icon="water-outline"
            theme={themeColors}
            delay={650}
          />
          <MetricCard
            label="Vocabulario"
            value={scores?.vocabulary_score}
            icon="book-outline"
            theme={themeColors}
            delay={700}
          />
          <MetricCard
            label="Gramática"
            value={scores?.grammar_score}
            icon="construct-outline"
            theme={themeColors}
            delay={750}
          />
          <MetricCard
            label="Coherencia"
            value={scores?.coherence_score}
            icon="git-network-outline"
            theme={themeColors}
            delay={800}
          />
        </Animated.View>

        {/* Feedback Section */}
        <Animated.View entering={FadeInDown.delay(1000).duration(600)} style={styles.section}>
          <Typography variant="h3" style={{ marginBottom: 16 }}>Feedback IA</Typography>
          <View style={{ gap: 12 }}>
            {feedbackPoints.map((point: string, i: number) => (
              <Animated.View
                key={i}
                entering={FadeInRight.delay(1100 + i * 100).duration(500)}
                style={[styles.feedbackCard, { backgroundColor: themeColors.inputBackground }]}
              >
                <View style={[styles.iconBox, { backgroundColor: themeColors.surface }]}>
                  <Ionicons name="sparkles" size={18} color={themeColors.primary} />
                </View>
                <Typography variant="body" style={{ flex: 1, lineHeight: 22 }}>{point}</Typography>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Transcript Section */}
        {feedback?.transcript && (
          <Animated.View entering={FadeInDown.delay(1200).duration(600)} style={styles.section}>
            <TouchableOpacity
              onPress={() => setTranscriptExpanded((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
            >
              <Typography variant="h3">Transcripción</Typography>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Typography variant="caption" color={themeColors.subtext}>
                  {transcriptExpanded ? 'Ocultar' : 'Mostrar'}
                </Typography>
                <Ionicons
                  name={transcriptExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={themeColors.subtext}
                />
              </View>
            </TouchableOpacity>
            <View style={[styles.transcriptCard, { backgroundColor: themeColors.inputBackground }]}>
              {(() => {
                const text: string = feedback.transcript;
                const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
                const dur = attempt?.duration_seconds || 0;
                const durationLabel = formatDuration(dur);
                return (
                  <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="document-text-outline" size={14} color={themeColors.subtext} />
                      <Typography variant="caption" color={themeColors.subtext}>
                        {wordCount} palabra{wordCount === 1 ? '' : 's'}
                      </Typography>
                    </View>
                    {dur > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="time-outline" size={14} color={themeColors.subtext} />
                        <Typography variant="caption" color={themeColors.subtext}>
                          {durationLabel}
                        </Typography>
                      </View>
                    )}
                  </View>
                );
              })()}
              <Typography
                variant="body"
                style={{ lineHeight: 22 }}
                numberOfLines={transcriptExpanded ? undefined : 4}
              >
                {feedback.transcript}
              </Typography>
            </View>
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View entering={FadeIn.delay(1500).duration(800)} style={styles.actions}>
          <Button
            title="Practicar de nuevo"
            onPress={() => router.replace('/(tabs)/practice')}
            style={{ width: '100%' }}
          />
          <Button
            title="Eliminar intento"
            variant="ghost"
            style={{ width: '100%', borderColor: themeColors.error }}
            onPress={handleDelete}
          />
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenWrapper>
  );
}

function MetricCard({ label, value = 0, subValue, displayValue, theme, delay, icon, hideBar, small }: any) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.surface, width: small ? '31%' : '48%', padding: small ? 12 : 16 }]}>
      <View style={styles.metricHeader}>
        <Ionicons name={icon} size={small ? 16 : 20} color={theme.subtext} />
        {/* If small, maybe trunc or smaller font? */}
        {!small && <Typography variant="caption" color={theme.subtext} weight="bold">{label}</Typography>}
      </View>
      {small && <Typography variant="caption" color={theme.subtext} weight="bold" style={{ marginTop: 4, fontSize: 10 }} numberOfLines={1}>{label}</Typography>}

      <View style={{ marginTop: small ? 8 : 12 }}>
        <View style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <Typography variant={small ? "h4" : "h3"} color={theme.text}>{displayValue || value}</Typography>
          {subValue && (
            <Typography variant="caption" color={theme.subtext} style={{ fontSize: 10, marginTop: 2 }}>{subValue}</Typography>
          )}
        </View>

        {!hideBar && (
          <View style={[styles.progressBarBg, { backgroundColor: theme.inputBackground, marginTop: small ? 6 : 8 }]}>
            <Animated.View
              entering={FadeInRight.delay(delay).duration(1000)}
              style={{
                height: '100%',
                width: `${Math.min(value, 100)}%`,
                backgroundColor: value > 80 ? theme.success : value > 50 ? theme.accent : theme.error,
                borderRadius: 4
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  mainScoreCard: {
    padding: 32,
    borderRadius: 32,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  scoreCircleBackground: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0061FF0D', // Primary with 5% opacity
    zIndex: -1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 4,
  },
  threeColumnGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  metricCard: {
    // width handled in prop
    borderRadius: 20,
    minHeight: 100,
    justifyContent: 'space-between',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  section: {
    marginBottom: 32,
  },
  feedbackCard: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 16,
  },
  transcriptCard: {
    padding: 16,
    borderRadius: 16,
  },
  unlocksCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    gap: 16,
  }
});
