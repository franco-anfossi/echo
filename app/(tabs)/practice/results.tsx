import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';

// Helper component for animating numbers naturally
const AnimatedScore = ({ score, color }: { score: number, color: string }) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
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
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<any>(null);
  const [scores, setScores] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const retryCount = useRef(0);
  const lastRetryTime = useRef(0);
  const isRequestInProgress = useRef(false);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={64} color={themeColors.error} />
          <Typography variant="h3" style={{ marginTop: 20 }}>Error en el análisis</Typography>
          <Button title="Volver" onPress={() => router.replace('/(tabs)/practice')} style={{ marginTop: 20 }} />
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
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </Animated.View>

        {/* Global Score Results */}
        <Animated.View
          entering={ZoomIn.delay(300).duration(500)}
          style={[styles.mainScoreCard, { backgroundColor: themeColors.surface }]}
        >
          <View style={styles.scoreCircleBackground} />
          <Typography variant="label" color={themeColors.subtext} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            PUNTUACIÓN GLOBAL
          </Typography>
          <View style={styles.scoreRow}>
            <AnimatedScore score={scores?.overall_score || 0} color={themeColors.primary} />
            <Typography variant="h3" color={themeColors.subtext} style={{ marginBottom: 6 }}>/100</Typography>
          </View>
        </Animated.View>

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
