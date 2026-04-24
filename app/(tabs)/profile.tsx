import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Achievement, computeAchievements } from '@/lib/achievements';
import { readCache, writeCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const METRICS = [
  { id: 'overall_score', label: 'Global', type: 'score', max: 100, target: 80 },
  { id: 'fluency_score', label: 'Fluidez', type: 'score', max: 100, target: 85 },
  { id: 'wpm', label: 'WPM (Real)', type: 'metric', max: 200, target: 150, targetMax: 190 },
  { id: 'filler_score', label: 'Muletillas (Pts)', type: 'score', max: 100, target: 90 },
  { id: 'wpm_score', label: 'Velocidad (Pts)', type: 'score', max: 100, target: 80 },
  { id: 'coherence_score', label: 'Coherencia', type: 'score', max: 100, target: 85 },
  { id: 'vocabulary_score', label: 'Vocabulario', type: 'score', max: 100, target: 80 },
  { id: 'grammar_score', label: 'Gramática', type: 'score', max: 100, target: 90 },
  { id: 'pause_score', label: 'Pausas', type: 'score', max: 100, target: 80 },
];

export default function Profile() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [stats, setStats] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0]);
  const [monthlyAverage, setMonthlyAverage] = useState(0);
  const [bestScoreEver, setBestScoreEver] = useState(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [modeBreakdown, setModeBreakdown] = useState<{ id: string; label: string; color: string; count: number; avg: number }[]>([]);
  const [activeDays, setActiveDays] = useState<boolean[]>(Array(30).fill(false));

  const cacheKey = user?.id ? `echo:profile:${user.id}` : null;

  useEffect(() => {
    if (!cacheKey) return;
    readCache<any>(cacheKey).then((c) => {
      if (!c) return;
      setStats((prev: any) => prev || c.stats || null);
      setMonthlyAverage((prev) => prev || c.monthlyAverage || 0);
      setBestScoreEver((prev) => prev || c.bestScoreEver || 0);
      setAchievements((prev) => (prev.length ? prev : c.achievements || []));
      setModeBreakdown((prev) => (prev.length ? prev : c.modeBreakdown || []));
      if (Array.isArray(c.activeDays) && c.activeDays.length === 30) setActiveDays(c.activeDays);
      setLoading(false);
    });
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey || loading) return;
    writeCache(cacheKey, { stats, monthlyAverage, bestScoreEver, achievements, modeBreakdown, activeDays });
  }, [cacheKey, loading, stats, monthlyAverage, bestScoreEver, achievements, modeBreakdown, activeDays]);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [user])
  );

  const fetchProfileData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch Profile Stats
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setStats(profileData);

      // 2. Fetch Last 30 Days (for Monthly Avg) & Weekly Data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: attemptsData, error: attemptsError } = await supabase
        .from('attempts')
        .select(`
          created_at,
          practice_type,
          attempt_scores (*),
          attempt_metrics (*)
        `)
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (attemptsError) throw attemptsError;

      type AttemptRow = {
        created_at: string;
        practice_type?: string | null;
        attempt_scores: Record<string, number> | Record<string, number>[] | null;
        attempt_metrics: Record<string, number> | Record<string, number>[] | null;
      };
      const validAttempts: AttemptRow[] = (attemptsData as AttemptRow[] | null) || [];
      const pickRow = <T,>(rel: T | T[] | null | undefined): T | null => {
        if (!rel) return null;
        return Array.isArray(rel) ? (rel[0] ?? null) : rel;
      };
      const scores = validAttempts
        .map(a => pickRow(a.attempt_scores)?.overall_score || 0)
        .filter(s => s > 0);
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      setMonthlyAverage(avg);

      // Achievements: best score (all-time), unique modes (last 30d window OK as "exposure")
      const { data: bestRow } = await supabase
        .from('attempt_scores')
        .select('overall_score, attempts!inner(user_id)')
        .eq('attempts.user_id', user.id)
        .order('overall_score', { ascending: false })
        .limit(1)
        .maybeSingle();
      const bestOverall = (bestRow as any)?.overall_score || 0;
      setBestScoreEver(bestOverall);
      const uniqueModes = new Set(
        validAttempts.map(a => a.practice_type).filter(Boolean) as string[]
      ).size;

      // Per-mode breakdown over the last 30 days
      const MODE_META: Record<string, { label: string; color: string }> = {
        improv: { label: 'Improvisar', color: '#3B82F6' },
        reading: { label: 'Lectura', color: '#10B981' },
        vocab: { label: 'Vocabulario', color: '#8B5CF6' },
        interview: { label: 'Entrevista', color: '#F59E0B' },
        debate: { label: 'Debate', color: '#EF4444' },
      };
      const modeBuckets: Record<string, { sum: number; count: number }> = {};
      for (const a of validAttempts) {
        const mode = a.practice_type || 'improv';
        if (!modeBuckets[mode]) modeBuckets[mode] = { sum: 0, count: 0 };
        const score = pickRow(a.attempt_scores)?.overall_score || 0;
        modeBuckets[mode].count += 1;
        if (score > 0) modeBuckets[mode].sum += score;
      }
      setModeBreakdown(
        Object.keys(MODE_META).map((id) => {
          const b = modeBuckets[id] || { sum: 0, count: 0 };
          return {
            id,
            label: MODE_META[id].label,
            color: MODE_META[id].color,
            count: b.count,
            avg: b.count > 0 ? Math.round(b.sum / b.count) : 0,
          };
        })
      );
      setAchievements(computeAchievements({
        total_attempts: profileData?.total_attempts || 0,
        streak_current: profileData?.streak_current || 0,
        streak_longest: profileData?.streak_longest || 0,
        xp: profileData?.xp || 0,
        best_overall_score: bestOverall,
        monthly_avg_score: avg,
        unique_modes_used: uniqueModes,
      }));

      // Active-day grid for last 30 days
      const active: boolean[] = [];
      const todayMid = new Date();
      todayMid.setHours(0, 0, 0, 0);
      const attemptKeys = new Set(
        validAttempts.map((a) => {
          const d = new Date(a.created_at);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        })
      );
      for (let i = 29; i >= 0; i--) {
        const d = new Date(todayMid);
        d.setDate(todayMid.getDate() - i);
        active.push(attemptKeys.has(d.getTime()));
      }
      setActiveDays(active);

      // Filter for Chart (Last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const weekly = validAttempts.filter(a => new Date(a.created_at) >= sevenDaysAgo);
      setWeeklyData(weekly);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getChartData = () => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayLabel = days[d.getDay()];

      // Filter attempts for this day
      const dayAttempts = weeklyData.filter(a => {
        const aDate = new Date(a.created_at);
        return aDate.getDate() === d.getDate() && aDate.getMonth() === d.getMonth();
      });

      // Calculate value based on selected metric
      let dailyValue = 0;
      if (dayAttempts.length > 0) {
        const pickRow = (rel: any): Record<string, number> | null => {
          if (!rel) return null;
          return Array.isArray(rel) ? (rel[0] ?? null) : rel;
        };
        const sum = dayAttempts.reduce((acc, curr) => {
          const row = selectedMetric.type === 'score'
            ? pickRow(curr.attempt_scores)
            : pickRow(curr.attempt_metrics);
          return acc + (row?.[selectedMetric.id] || 0);
        }, 0);
        dailyValue = Math.round(sum / dayAttempts.length);
      }

      result.push({
        label: dayLabel,
        value: dailyValue,
        active: dayAttempts.length > 0
      });
    }
    return result;
  };

  const chartData = getChartData();
  const currentWeekAvg = Math.round(chartData.filter(d => d.active).reduce((acc, curr, _, arr) => acc + curr.value / arr.length, 0));

  // Dynamic Scale Calculation
  const dataMax = Math.max(...chartData.map(d => d.value), 0);
  const targetMaxBound = selectedMetric.targetMax || selectedMetric.target || 0;
  // Determine scale max: at least metric.max (e.g. 100 for score), but expand if data or target is higher
  // Add 20% padding to avoid top collision
  const scaleMax = Math.max(
    selectedMetric.type === 'score' ? 100 : (selectedMetric.max || 100),
    dataMax * 1.2,
    targetMaxBound * 1.2
  );

  // Status Logic
  let isMeetingTarget = false;
  let statusText = '';
  let statusColor = themeColors.text;

  if (selectedMetric.targetMax) {
    // Range Logic
    if (currentWeekAvg >= selectedMetric.target && currentWeekAvg <= selectedMetric.targetMax) {
      isMeetingTarget = true;
      statusText = 'En objetivo';
      statusColor = themeColors.success;
    } else if (currentWeekAvg > selectedMetric.targetMax) {
      isMeetingTarget = false;
      const diff = currentWeekAvg - selectedMetric.targetMax;
      statusText = `${diff} pts sobre meta`;
      statusColor = themeColors.warning;
    } else {
      isMeetingTarget = false;
      const diff = selectedMetric.target - currentWeekAvg;
      statusText = `${diff} pts bajo meta`;
      statusColor = themeColors.warning;
    }
  } else if (selectedMetric.target) {
    // Threshold Logic (more is better)
    isMeetingTarget = currentWeekAvg >= selectedMetric.target;
    const diff = Math.abs(currentWeekAvg - selectedMetric.target);
    if (isMeetingTarget) {
      statusText = `${diff} pts sobre meta`;
      statusColor = themeColors.success;
    } else {
      statusText = `${diff} pts bajo meta`;
      statusColor = themeColors.error;
    }
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="h2" weight="bold">
            {Strings.profile.title}
          </Typography>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            accessibilityLabel="Abrir configuración"
            accessibilityRole="button"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: themeColors.surface,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: themeColors.border
            }}
          >
            <Ionicons name="settings-outline" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Profile Header - Clean & Minimal */}
        <View style={[styles.profileCard, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: themeColors.primary }]}>
            <Typography variant="h1" color="#FFF">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </Typography>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Typography variant="h3" style={{ marginBottom: 4 }}>
              {user?.user_metadata?.full_name || 'Usuario'}
            </Typography>
            <Typography variant="body" color={themeColors.subtext}>
              {user?.email}
            </Typography>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={themeColors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <>
            {/* Stats Grid - Blue Theme */}
            <View style={styles.section}>
              <Typography variant="h3" style={{ marginBottom: 16 }}>Estadísticas</Typography>
              <View style={styles.statsGrid}>
                <StatBox label="Racha Actual" value={stats?.streak_current || 0} icon="flame" theme={themeColors} specialColor="#FF8C00" />
                <StatBox label="Mejor Racha" value={stats?.streak_longest || 0} icon="trophy" theme={themeColors} />
                <StatBox label="Prácticas" value={stats?.total_attempts || 0} icon="mic" theme={themeColors} />
                <StatBox label="Promedio Mes" value={monthlyAverage} icon="bar-chart" theme={themeColors} isHighlight />
                <StatBox label="Mejor Puntaje" value={bestScoreEver} icon="star" theme={themeColors} specialColor="#F59E0B" />
                <StatBox label="XP Total" value={stats?.xp || 0} icon="sparkles" theme={themeColors} />
              </View>
            </View>

            {/* 30-day streak calendar */}
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Typography variant="h3">Últimos 30 días</Typography>
                <Typography variant="caption" color={themeColors.subtext}>
                  {activeDays.filter(Boolean).length} día{activeDays.filter(Boolean).length === 1 ? '' : 's'}
                </Typography>
              </View>
              <View style={[styles.calendarCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {activeDays.map((on, i) => (
                    <View
                      key={i}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        backgroundColor: on ? themeColors.primary : themeColors.inputBackground,
                      }}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: themeColors.inputBackground }} />
                  <Typography variant="caption" color={themeColors.subtext}>sin práctica</Typography>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: themeColors.primary, marginLeft: 8 }} />
                  <Typography variant="caption" color={themeColors.subtext}>activo</Typography>
                </View>
              </View>
            </View>

            {/* Per-mode breakdown */}
            {modeBreakdown.some(m => m.count > 0) && (
              <View style={styles.section}>
                <Typography variant="h3" style={{ marginBottom: 16 }}>Por modalidad (30 días)</Typography>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {modeBreakdown.map((m) => {
                    const inactive = m.count === 0;
                    return (
                      <View
                        key={m.id}
                        style={{
                          width: '48%',
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          backgroundColor: themeColors.surface,
                          borderColor: inactive ? themeColors.border : m.color + '55',
                          opacity: inactive ? 0.6 : 1,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" weight="bold" color={m.color}>
                            {m.label.toUpperCase()}
                          </Typography>
                          <Typography variant="caption" color={themeColors.subtext}>
                            {m.count}
                          </Typography>
                        </View>
                        <Typography variant="h3" weight="bold" color={themeColors.text} style={{ marginTop: 4 }}>
                          {inactive ? '–' : m.avg}
                        </Typography>
                        <Typography variant="caption" color={themeColors.subtext} style={{ fontSize: 10 }}>
                          {inactive ? 'Sin práctica aún' : 'puntaje promedio'}
                        </Typography>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Achievements */}
            {achievements.length > 0 && (() => {
              const unlockedCount = achievements.filter(a => a.unlocked).length;
              return (
              <View style={styles.section}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Typography variant="h3">Logros</Typography>
                  <Typography variant="caption" color={themeColors.subtext}>
                    {unlockedCount} / {achievements.length}
                  </Typography>
                </View>
                {unlockedCount === 0 && (
                  <View style={[styles.achievementsHint, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.border }]}>
                    <Ionicons name="medal-outline" size={20} color={themeColors.subtext} />
                    <Typography variant="caption" color={themeColors.subtext} style={{ flex: 1, lineHeight: 18 }}>
                      Aún no desbloqueas logros. Tu primera práctica es la más cercana.
                    </Typography>
                  </View>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
                  {achievements.map((a) => (
                    <View
                      key={a.id}
                      style={[
                        styles.achievementCard,
                        {
                          backgroundColor: themeColors.surface,
                          borderColor: a.unlocked ? a.color : themeColors.border,
                          opacity: a.unlocked ? 1 : 0.65,
                        }
                      ]}
                    >
                      <View style={[styles.achievementIcon, { backgroundColor: a.color + (a.unlocked ? '22' : '12') }]}>
                        <Ionicons name={a.icon as any} size={26} color={a.color} />
                      </View>
                      <Typography variant="label" weight="bold" style={{ marginTop: 10 }} numberOfLines={1}>
                        {a.title}
                      </Typography>
                      <Typography variant="caption" color={themeColors.subtext} numberOfLines={2} style={{ marginTop: 2, minHeight: 32 }}>
                        {a.description}
                      </Typography>
                      <View style={{ height: 6, backgroundColor: themeColors.inputBackground, borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                        <View style={{
                          width: `${Math.round(a.progress * 100)}%`,
                          height: '100%',
                          backgroundColor: a.unlocked ? a.color : themeColors.primary,
                        }} />
                      </View>
                      <Typography variant="caption" color={themeColors.subtext} style={{ marginTop: 6, fontSize: 10 }} numberOfLines={1}>
                        {a.progressLabel}
                      </Typography>
                    </View>
                  ))}
                </ScrollView>
              </View>
              );
            })()}

            {/* Weekly Evolution */}
            <View style={[styles.section, { marginBottom: 40 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Typography variant="h3">Progreso Semanal</Typography>
                {selectedMetric.target && (
                  <View style={[styles.diffTag, { backgroundColor: isMeetingTarget ? '#E6F4EA' : (statusColor === themeColors.warning ? '#FFF3E0' : '#FCE8E6') }]}>
                    <Ionicons
                      name={isMeetingTarget ? "checkmark-circle" : (currentWeekAvg > (selectedMetric.targetMax || selectedMetric.target) ? "arrow-up" : "arrow-down")}
                      size={14}
                      color={statusColor}
                    />
                    <Typography variant="caption" weight="bold" color={statusColor} style={{ marginLeft: 4 }}>
                      {statusText}
                    </Typography>
                  </View>
                )}
              </View>

              {/* Metric Selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorContainer}>
                {METRICS.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelectedMetric(m)}
                    style={[
                      styles.metricChip,
                      {
                        backgroundColor: selectedMetric.id === m.id ? themeColors.primary : themeColors.surface,
                        borderColor: selectedMetric.id === m.id ? themeColors.primary : themeColors.border
                      }
                    ]}
                  >
                    <Typography
                      variant="caption"
                      weight="bold"
                      color={selectedMetric.id === m.id ? '#FFF' : themeColors.subtext}
                    >
                      {m.label}
                    </Typography>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Chart */}
              <View style={[styles.chartContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                {/* Horizontal Reference Lines (Grid) */}
                <View style={[styles.gridLine, { bottom: '25%', borderColor: themeColors.border }]} />
                <View style={[styles.gridLine, { bottom: '50%', borderColor: themeColors.border }]} />
                <View style={[styles.gridLine, { bottom: '75%', borderColor: themeColors.border }]} />

                {/* Target Range/Line */}
                {selectedMetric.target && (
                  <>
                    {selectedMetric.targetMax ? (
                      // Range Band
                      <View style={{
                        position: 'absolute',
                        bottom: (selectedMetric.target / scaleMax) * 180 + 20,
                        height: ((selectedMetric.targetMax - selectedMetric.target) / scaleMax) * 180,
                        left: 20,
                        right: 20,
                        backgroundColor: themeColors.success,
                        opacity: 0.1,
                        zIndex: 1,
                        borderRadius: 4
                      }} />
                    ) : null}

                    {/* Target Line (Min or Target) */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: (selectedMetric.target / scaleMax) * 180 + 20,
                        left: 20,
                        right: 20,
                        borderBottomWidth: 2,
                        borderBottomColor: themeColors.subtext,
                        borderStyle: 'dashed',
                        zIndex: 1,
                        opacity: 0.3
                      }}
                    />
                  </>
                )}

                {/* Bars */}
                {chartData.map((day, index) => {
                  let percentage = (day.value / scaleMax) * 100;
                  if (percentage > 100) percentage = 100;

                  // Bar color logic
                  let barColor = themeColors.primary;
                  if (day.active) {
                    if (selectedMetric.targetMax) {
                      // Range
                      if (day.value >= selectedMetric.target && day.value <= selectedMetric.targetMax) {
                        barColor = themeColors.success;
                      } else {
                        barColor = themeColors.warning; // Warning
                      }
                    } else if (selectedMetric.target) {
                      barColor = day.value >= selectedMetric.target ? themeColors.success : themeColors.warning;
                    }
                  } else {
                    barColor = 'transparent';
                  }

                  return (
                    <View key={index} style={styles.chartBarContainer}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${Math.max(percentage, day.active ? 4 : 0)}%`, // Min height for visibility
                              backgroundColor: barColor,
                              opacity: day.active ? 1 : 0
                            }
                          ]}
                        />
                      </View>
                      <Typography variant="caption" style={{ marginTop: 8, fontSize: 10 }} color={themeColors.subtext}>
                        {day.label}
                      </Typography>
                      {day.active && (
                        <Typography variant="caption" style={{ position: 'absolute', top: -25, fontSize: 10 }} color={themeColors.text} weight="bold">
                          {day.value}
                        </Typography>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Legend with Meta */}
              {selectedMetric.target && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: themeColors.success }} />
                      <Typography variant="caption" color={themeColors.subtext}>
                        {selectedMetric.targetMax ? 'En objetivo' : 'Sobre meta'}
                      </Typography>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: themeColors.warning }} />
                      <Typography variant="caption" color={themeColors.subtext}>A mejorar</Typography>
                    </View>
                  </View>
                  <Typography variant="caption" color={themeColors.subtext} align="center">
                    {selectedMetric.targetMax ? `Meta ideal: ${selectedMetric.target} - ${selectedMetric.targetMax}` : `Meta: ${selectedMetric.target}`}
                  </Typography>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function StatBox({ label, value, icon, theme, specialColor, isHighlight }: any) {
  return (
    <View style={[
      styles.statBox,
      {
        backgroundColor: isHighlight ? theme.secondary : theme.surface,
        borderColor: isHighlight ? theme.primary : theme.border,
        borderWidth: 1 // Clean thin border
      }
    ]}>
      <View style={[styles.statIconCircle, { backgroundColor: isHighlight ? '#FFFFFF' : theme.inputBackground }]}>
        <Ionicons name={icon} size={20} color={specialColor || (isHighlight ? theme.primary : theme.text)} />
      </View>
      <Typography variant="h2" weight="bold" color={theme.text} style={{ marginTop: 8 }}>{value}</Typography>
      <Typography variant="caption" color={theme.subtext} align="center">{label}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  profileCard: {
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 32,
    // Soft shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: "#0061FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, // Blue shadow for avatar
    shadowRadius: 12,
    elevation: 8,
  },
  section: {
    marginBottom: 24,
  },
  diffTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    width: '48%',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 130,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementCard: {
    width: 160,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  achievementsHint: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  calendarCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  achievementIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  metricChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 40,
    borderRadius: 20,
    borderWidth: 1,
    height: 240,
    alignItems: 'flex-end',
    position: 'relative'
  },
  gridLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dotted',
    opacity: 0.3,
  },
  chartBarContainer: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
    zIndex: 2
  },
  barTrack: {
    width: 12, // More elegant thin bars
    height: '100%',
    justifyContent: 'flex-end',
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    minHeight: 0,
  },
});
